import { MSG_STATE, MSG_AGENT_RESPONSE, MSG_TTS_END, MSG_INTERRUPT } from './protocol.js';
import { addTranscriptItem } from '../transcript/renderer.js';
import { updateAgentState } from '../agent-ui/state-display.js';

let ws = null;
let sessionToken = null;
let currentAgentState = 'LISTENING';
let ttsPlayer = null;
let uiElements = null;
let stats = { messages: 0, finals: 0 };

export function initWsClient(player, elements) {
  ttsPlayer = player;
  uiElements = elements;
}

async function getSessionToken() {
  if (sessionToken) return sessionToken;
  const response = await fetch('api/session');
  if (!response.ok) throw new Error(`Session failed: ${response.status}`);
  const data = await response.json();
  sessionToken = data.token;
  return sessionToken;
}

export async function connect(config) {
  const token = await getSessionToken();

  const params = new URLSearchParams({
    model: config.model,
    language: config.language,
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    tts_voice: config.ttsVoice || 'thalia',
  });
  const wsUrl = new URL(`api/voice?${params}`, document.baseURI);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  ws = new WebSocket(wsUrl.href, [`access_token.${token}`]);
  ws.binaryType = 'arraybuffer';

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
    ws.onmessage = handleMessage;
    ws.onclose = handleClose;
  });
}

let ttsChunksReceived = 0;

function handleMessage(event) {
  // Binary = TTS audio
  if (event.data instanceof ArrayBuffer) {
    ttsChunksReceived++;
    if (ttsChunksReceived <= 5 || ttsChunksReceived % 20 === 0) {
      console.log(`[TTS] rx chunk #${ttsChunksReceived}: ${event.data.byteLength} bytes, agentState=${currentAgentState}`);
    }
    if (currentAgentState !== 'SPEAKING') {
      console.warn(`[TTS] ⚠ received audio chunk but agentState=${currentAgentState}, not SPEAKING — chunk will still play`);
    }
    if (ttsPlayer) ttsPlayer.playChunk(event.data);
    return;
  }

  try {
    const data = JSON.parse(event.data);

    if (data.type === MSG_STATE) {
      console.log(`[STATE] ${currentAgentState} → ${data.state}`);
      currentAgentState = data.state;
      if (data.state === 'SPEAKING') ttsChunksReceived = 0;
      updateAgentState(data.state, uiElements?.agentState);
      return;
    }

    if (data.type === MSG_AGENT_RESPONSE) {
      console.log(`[AGENT] response text length=${data.text?.length}`);
      addTranscriptItem(data.text, true, true);
      return;
    }

    if (data.type === MSG_TTS_END) {
      console.log(`[TTS] end signal received, total chunks played: ${ttsChunksReceived}`);
      return;
    }

    // Deepgram transcript
    stats.messages++;
    if (uiElements?.messageCount) uiElements.messageCount.textContent = stats.messages;

    if (data.type === 'Results' || data.channel) {
      const transcript = data.channel?.alternatives?.[0]?.transcript || '';
      const isFinal = data.is_final || false;
      const speechFinal = data.speech_final || false;

      if (transcript) {
        addTranscriptItem(transcript, isFinal);
        if (isFinal) {
          stats.finals++;
          if (uiElements?.finalCount) uiElements.finalCount.textContent = stats.finals;
        }
      }

      // Barge-in: if user produces any final transcript while agent is speaking, interrupt
      if (isFinal && transcript && currentAgentState === 'SPEAKING') {
        console.warn(`[BARGE-IN] triggered — transcript="${transcript}" — stopping TTS`);
        if (ttsPlayer) ttsPlayer.stop();
        sendInterrupt();
      }
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
}

function handleClose(event) {
  console.log('WebSocket closed:', event.code, event.reason);
  ws = null;
  currentAgentState = 'LISTENING';
  stats = { messages: 0, finals: 0 };
  if (event.code === 4401) {
    sessionToken = null;
  }
}

export function sendAudio(buffer) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(buffer);
  }
}

function sendInterrupt() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: MSG_INTERRUPT }));
  }
}

export function disconnect() {
  if (ws) {
    ws.close(1000, 'User disconnected');
    ws = null;
  }
  if (ttsPlayer) ttsPlayer.stop();
  currentAgentState = 'LISTENING';
  stats = { messages: 0, finals: 0 };
}

export function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

export function setOnClose(callback) {
  if (ws) {
    const origClose = ws.onclose;
    ws.onclose = (event) => {
      if (origClose) origClose(event);
      callback(event);
    };
  }
}
