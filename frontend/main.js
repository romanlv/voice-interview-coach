import { initElements, elements, loadMetadata } from './features/config/settings.js';
import { initRenderer } from './features/transcript/renderer.js';
import { initAudioContext, startMicrophone, stopMicrophone } from './features/audio/mic-capture.js';
import { TTSPlayer } from './features/audio/tts-player.js';
import { initWsClient, connect, disconnect, sendAudio, setOnClose } from './features/connection/ws-client.js';

const ttsPlayer = new TTSPlayer();

document.addEventListener('DOMContentLoaded', () => {
  initElements();
  initRenderer(elements.transcriptContainer, elements.emptyState);
  initWsClient(ttsPlayer, elements);
  loadMetadata();

  elements.connectBtn.addEventListener('click', handleConnect);
  elements.disconnectBtn.addEventListener('click', handleDisconnect);
  window.addEventListener('beforeunload', handleDisconnect);
});

async function handleConnect() {
  if (!elements.connectBtn) return;
  elements.connectBtn.disabled = true;
  elements.connectBtn.textContent = 'Connecting...';

  try {
    const config = {
      model: elements.modelSelect.value,
      language: elements.languageInput.value,
      ttsVoice: elements.ttsVoiceSelect.value,
    };

    await ttsPlayer.init();
    await connect(config);
    setOnClose(onWsClosed);

    updateConnectionStatus(false, 'Requesting microphone...');
    elements.currentModel.textContent = config.model;
    elements.currentLanguage.textContent = config.language;
    elements.modelSelect.disabled = true;
    elements.languageInput.disabled = true;
    elements.ttsVoiceSelect.disabled = true;

    await initAudioContext();
    await startMicrophone((buffer) => sendAudio(buffer));

    elements.connectOverlay.classList.add('hidden');
    elements.disconnectContainer.classList.remove('hidden');
    elements.transcriptContainer.classList.remove('hidden');
    updateConnectionStatus(true, 'Connected');
    elements.micStatus.textContent = 'Active';
    elements.micStatus.style.color = 'var(--dg-primary, #13ef95)';
  } catch (error) {
    console.error('Connection error:', error);
    alert('Failed to connect. Check console for details.');
    resetUI();
  }
}

function handleDisconnect() {
  disconnect();
  stopMicrophone();
  resetUI();
}

function onWsClosed(event) {
  stopMicrophone();
  setTimeout(() => resetUI(), 2000);
}

function resetUI() {
  elements.connectBtn.disabled = false;
  elements.connectBtn.textContent = 'Connect';
  elements.modelSelect.disabled = false;
  elements.languageInput.disabled = false;
  elements.ttsVoiceSelect.disabled = false;
  elements.transcriptContainer.classList.add('hidden');
  elements.disconnectContainer.classList.add('hidden');
  elements.connectOverlay.classList.remove('hidden');
  updateConnectionStatus(false, 'Disconnected');
  elements.micStatus.textContent = 'Inactive';
  elements.micStatus.style.color = '';
  elements.currentModel.textContent = '-';
  elements.currentLanguage.textContent = '-';
}

function updateConnectionStatus(connected, text) {
  const el = elements.connectionStatus;
  el.className = connected
    ? 'status-badge status-badge--connected'
    : 'status-badge status-badge--disconnected';
  el.innerHTML = '';
  const indicator = document.createElement('span');
  indicator.className = connected
    ? 'status-indicator status-indicator--connected'
    : 'status-indicator status-indicator--disconnected';
  el.appendChild(indicator);
  el.appendChild(document.createTextNode(text));
}
