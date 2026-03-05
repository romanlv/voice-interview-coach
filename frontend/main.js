/**
 * Live Transcription Frontend
 * Connects to backend WebSocket proxy for Deepgram Live Transcription
 * Uses microphone for audio input
 */

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const SESSION_ENDPOINT = 'api/session';
let sessionToken = null;

async function getSessionToken() {
  if (sessionToken) return sessionToken;
  const response = await fetch(SESSION_ENDPOINT);
  if (!response.ok) throw new Error(`Session failed: ${response.status}`);
  const data = await response.json();
  sessionToken = data.token;
  return sessionToken;
}

// ============================================================================
// STATE MANAGEMENT (continued)
// ============================================================================

const state = {
  ws: null,
  isConnected: false,
  audioContext: null,
  mediaStream: null,
  audioProcessor: null,
  stats: {
    messages: 0,
    finals: 0
  },
  config: {
    model: 'nova-3',
    language: 'en'
  }
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  // Metadata
  pageTitle: document.getElementById('pageTitle'),
  pageDescription: document.getElementById('pageDescription'),
  headerTitle: document.getElementById('headerTitle'),
  repoLink: document.getElementById('repoLink'),

  // Config
  modelSelect: document.getElementById('model-select'),
  languageInput: document.getElementById('language-input'),

  // UI controls
  connectOverlay: document.getElementById('connect-overlay'),
  connectBtn: document.getElementById('connect-btn'),
  disconnectContainer: document.getElementById('disconnect-container'),
  disconnectBtn: document.getElementById('disconnect-btn'),

  // Transcript
  transcriptContainer: document.getElementById('transcript-container'),
  emptyState: document.getElementById('empty-state'),

  // Status
  connectionStatus: document.getElementById('connection-status'),
  micStatus: document.getElementById('mic-status'),
  currentModel: document.getElementById('current-model'),
  currentLanguage: document.getElementById('current-language'),
  messageCount: document.getElementById('message-count'),
  finalCount: document.getElementById('final-count')
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadMetadata();
});

function initializeEventListeners() {
  elements.connectBtn.addEventListener('click', connect);
  elements.disconnectBtn.addEventListener('click', disconnect);

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    disconnect();
  });
}

// ============================================================================
// METADATA LOADING
// ============================================================================

async function loadMetadata() {
  try {
    const response = await fetch('api/metadata');
    if (!response.ok) {
      console.warn('Failed to load metadata, using defaults');
      return;
    }

    const metadata = await response.json();

    // Update page title
    if (metadata.title && elements.pageTitle) {
      elements.pageTitle.textContent = metadata.title;
    }

    // Update page description
    if (metadata.description && elements.pageDescription) {
      elements.pageDescription.setAttribute('content', metadata.description);
    }

    // Update header title
    if (metadata.title && elements.headerTitle) {
      elements.headerTitle.textContent = metadata.title;
    }

    // Update repository link
    if (metadata.repository && elements.repoLink) {
      elements.repoLink.href = metadata.repository;
    }

    console.log('Metadata loaded:', metadata);
  } catch (error) {
    console.warn('Error loading metadata, using defaults:', error);
  }
}

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

async function connect() {
  if (state.isConnected) return;

  // Get configuration
  state.config.model = elements.modelSelect.value;
  state.config.language = elements.languageInput.value;

  // Update UI
  elements.connectBtn.disabled = true;
  // Clear and set button content safely
  while (elements.connectBtn.firstChild) {
    elements.connectBtn.removeChild(elements.connectBtn.firstChild);
  }
  const spinner = document.createElement('i');
  spinner.className = 'fa-solid fa-spinner fa-spin';
  elements.connectBtn.appendChild(spinner);
  elements.connectBtn.appendChild(document.createTextNode(' Connecting...'));

  try {
    // Get session token for WebSocket auth
    const token = await getSessionToken();

    // Build WebSocket URL with audio format parameters
    const params = new URLSearchParams({
      model: state.config.model,
      language: state.config.language,
      encoding: 'linear16',  // We convert to Int16 PCM
      sample_rate: '16000',   // Requested audio context sample rate
      channels: '1'           // Mono audio
    });
    const wsUrl = new URL(`api/live-transcription?${params}`, document.baseURI);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    console.log('Connecting with params:', {
      model: state.config.model,
      language: state.config.language,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1
    });

    // Create WebSocket with JWT auth via subprotocol
    state.ws = new WebSocket(wsUrl.href, [`access_token.${token}`]);
    state.ws.binaryType = 'arraybuffer';

    state.ws.onopen = handleWebSocketOpen;
    state.ws.onmessage = handleWebSocketMessage;
    state.ws.onclose = handleWebSocketClose;
    state.ws.onerror = handleWebSocketError;

  } catch (error) {
    console.error('Connection error:', error);
    showError('Failed to connect to server');
    resetConnectButton();
  }
}

function handleWebSocketOpen() {
  console.log('WebSocket connected');
  onConnected();
}

function handleWebSocketMessage(event) {
  try {
    const data = JSON.parse(event.data);

    // Update message count
    state.stats.messages++;
    elements.messageCount.textContent = state.stats.messages;

    // Handle different message types from Deepgram
    if (data.type === 'Results' || data.channel) {
      const transcript = data.channel?.alternatives?.[0]?.transcript || data.transcript || '';
      const isFinal = data.is_final || data.speech_final || false;

      if (transcript) {
        addTranscriptItem(transcript, isFinal);

        if (isFinal) {
          state.stats.finals++;
          elements.finalCount.textContent = state.stats.finals;
        }
      }
    } else if (data.type === 'Metadata') {
      console.log('Metadata:', data);
    } else if (data.error) {
      console.error('Deepgram error:', data);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
}

function handleWebSocketError(error) {
  console.error('WebSocket error:', error);
  updateConnectionStatus(false, 'Error');
}

function handleWebSocketClose(event) {
  console.log('WebSocket closed:', event.code, event.reason);
  state.isConnected = false;

  // Handle session expiry
  if (event.code === 4401) {
    sessionToken = null;
    showError('Session expired, please refresh the page.');
    updateConnectionStatus(false, 'Session Expired');
    updateMicrophoneStatus(false);
    return;
  }

  updateConnectionStatus(false, 'Disconnected');
  updateMicrophoneStatus(false);

  // Show reconnect UI after delay
  setTimeout(() => {
    if (!state.isConnected) {
      elements.transcriptContainer.classList.add('hidden');
      elements.disconnectContainer.classList.add('hidden');
      elements.connectOverlay.classList.remove('hidden');
      resetConnectButton();
    }
  }, 2000);
}

// ============================================================================
// CONNECTION LIFECYCLE
// ============================================================================

async function onConnected() {
  console.log('WebSocket connected, requesting microphone...');

  // Set connected early so audio processor can send data
  state.isConnected = true;

  // Update status
  updateConnectionStatus(false, 'Requesting microphone...');
  elements.currentModel.textContent = state.config.model;
  elements.currentLanguage.textContent = state.config.language;

  // Disable config while connecting
  elements.modelSelect.disabled = true;
  elements.languageInput.disabled = true;

  try {
    // Initialize audio context
    await initializeAudioContext();

    // Automatically open microphone
    await startMicrophone();

    // Update UI
    elements.connectOverlay.classList.add('hidden');
    elements.disconnectContainer.classList.remove('hidden');
    elements.transcriptContainer.classList.remove('hidden');

    updateConnectionStatus(true, 'Connected');
    console.log('Fully connected - microphone active, ready to transcribe');

  } catch (error) {
    console.error('Failed to initialize audio:', error);
    state.isConnected = false;
    showError('Failed to access microphone. Please allow microphone access and try again.');
    disconnect();
  }
}

function disconnect() {
  // Close WebSocket
  if (state.ws) {
    state.ws.close(1000, 'User disconnected');
    state.ws = null;
  }

  // Stop microphone and audio processor
  if (state.audioProcessor) {
    state.audioProcessor.disconnect();
    state.audioProcessor = null;
  }

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }

  state.isConnected = false;

  // Update UI
  updateConnectionStatus(false, 'Disconnected');
  updateMicrophoneStatus(false);
  elements.currentModel.textContent = '-';
  elements.currentLanguage.textContent = '-';

  // Re-enable config
  elements.modelSelect.disabled = false;
  elements.languageInput.disabled = false;

  // Show connect overlay
  elements.transcriptContainer.classList.add('hidden');
  elements.disconnectContainer.classList.add('hidden');
  elements.connectOverlay.classList.remove('hidden');
  resetConnectButton();
}

function resetConnectButton() {
  elements.connectBtn.disabled = false;
  // Clear and set button content safely
  while (elements.connectBtn.firstChild) {
    elements.connectBtn.removeChild(elements.connectBtn.firstChild);
  }
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-plug';
  elements.connectBtn.appendChild(icon);
  elements.connectBtn.appendChild(document.createTextNode(' Connect'));
}

// ============================================================================
// AUDIO CONTEXT
// ============================================================================

async function initializeAudioContext() {
  if (state.audioContext) return;

  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
    });

    // Resume audio context on user interaction if needed
    if (state.audioContext.state === 'suspended') {
      await state.audioContext.resume();
    }

    console.log(`Audio context initialized: ${state.audioContext.sampleRate}Hz, ${state.audioContext.state}`);
  } catch (error) {
    console.error('Failed to initialize audio context:', error);
    showError('Failed to initialize audio system');
  }
}

// ============================================================================
// MICROPHONE CAPTURE
// ============================================================================

async function startMicrophone() {
  if (state.mediaStream) {
    console.log('Microphone already active');
    return;
  }

  updateMicrophoneStatus('Requesting...');
  console.log('Requesting microphone access...');

  // Request microphone access
  state.mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  console.log('Microphone access granted');

  // Create audio processing pipeline
  if (!state.audioContext) {
    await initializeAudioContext();
  }

  const source = state.audioContext.createMediaStreamSource(state.mediaStream);
  state.audioProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);

  let audioChunkCount = 0;
  state.audioProcessor.onaudioprocess = (e) => {
    if (!state.isConnected) return;

    const inputData = e.inputBuffer.getChannelData(0);

    // Convert float32 to int16
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send binary audio to WebSocket
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.send(pcm16.buffer);
        audioChunkCount++;
        if (audioChunkCount === 1) {
          console.log(`✓ First audio chunk sent (${pcm16.buffer.byteLength} bytes)`);
        } else if (audioChunkCount % 50 === 0) {
          console.log(`Sent ${audioChunkCount} audio chunks to server`);
        }
      } catch (error) {
        console.error('Error sending audio chunk:', error);
      }
    }
  };

  source.connect(state.audioProcessor);
  state.audioProcessor.connect(state.audioContext.destination);

  console.log('Audio processing pipeline connected');

  // Update status
  updateMicrophoneStatus(true);
  console.log('Microphone active - ready to transcribe');
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateConnectionStatus(connected, text) {
  elements.connectionStatus.className = connected
    ? 'status-badge status-badge--connected'
    : 'status-badge status-badge--disconnected';

  // Clear existing content
  while (elements.connectionStatus.firstChild) {
    elements.connectionStatus.removeChild(elements.connectionStatus.firstChild);
  }

  // Add indicator
  const indicator = document.createElement('span');
  indicator.className = connected
    ? 'status-indicator status-indicator--connected'
    : 'status-indicator status-indicator--disconnected';
  elements.connectionStatus.appendChild(indicator);

  // Add text
  elements.connectionStatus.appendChild(document.createTextNode(text));
}

function updateMicrophoneStatus(active) {
  if (active === true) {
    elements.micStatus.textContent = 'Active';
    elements.micStatus.style.color = 'var(--dg-primary, #13ef95)';
  } else if (active === false) {
    elements.micStatus.textContent = 'Inactive';
    elements.micStatus.style.color = '';
  } else {
    // String value (e.g., "Requesting...")
    elements.micStatus.textContent = active;
    elements.micStatus.style.color = '';
  }
}

function addTranscriptItem(text, isFinal) {
  // Remove empty state if present
  if (elements.emptyState && !elements.emptyState.classList.contains('hidden')) {
    elements.emptyState.classList.add('hidden');
  }

  const item = document.createElement('div');
  item.className = isFinal ? 'transcript-item' : 'transcript-item transcript-item--interim';

  // Add timestamp
  const timestamp = document.createElement('div');
  timestamp.className = 'transcript-item__timestamp';
  timestamp.textContent = new Date().toLocaleTimeString();
  item.appendChild(timestamp);

  // Add text
  const textDiv = document.createElement('div');
  textDiv.className = 'transcript-item__text';
  textDiv.textContent = text;
  item.appendChild(textDiv);

  // Replace last interim or append new
  const lastItem = elements.transcriptContainer.lastElementChild;
  if (!isFinal && lastItem && lastItem !== elements.emptyState && lastItem.classList.contains('transcript-item--interim')) {
    elements.transcriptContainer.replaceChild(item, lastItem);
  } else {
    elements.transcriptContainer.appendChild(item);
  }

  // Auto-scroll
  elements.transcriptContainer.scrollTop = elements.transcriptContainer.scrollHeight;
}

function showError(message) {
  alert(message);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('Live Transcription frontend initialized');
