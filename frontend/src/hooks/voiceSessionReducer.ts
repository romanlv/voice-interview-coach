import type { ConnectionState, AgentState, TranscriptItem, SessionConfig } from "./useVoiceSession";

export interface VoiceSessionState {
  connectionState: ConnectionState;
  agentState: AgentState;
  micActive: boolean;
  ttsActive: boolean;
  speakingEnteredAt: number;
  lastBargeInAt: number;
  transcripts: TranscriptItem[];
  stats: { messages: number; finals: number };
  activeConfig: SessionConfig | null;
}

export const initialState: VoiceSessionState = {
  connectionState: "disconnected",
  agentState: "LISTENING",
  micActive: false,
  ttsActive: false,
  speakingEnteredAt: 0,
  lastBargeInAt: 0,
  transcripts: [],
  stats: { messages: 0, finals: 0 },
  activeConfig: null,
};

export type VoiceSessionAction =
  | { type: "CONNECT_START" }
  | { type: "CONNECT_SUCCESS"; config: SessionConfig }
  | { type: "DISCONNECT" }
  | { type: "SERVER_STATE"; state: AgentState }
  | { type: "TTS_STARTED" }
  | { type: "TTS_STOPPED" }
  | { type: "MIC_ACTIVE"; active: boolean }
  | { type: "ADD_TRANSCRIPT"; item: TranscriptItem }
  | { type: "UPDATE_LAST_AGENT_TRANSCRIPT"; text: string }
  | { type: "COUNT_MESSAGE" }
  | { type: "COUNT_FINAL" }
  | { type: "BARGE_IN" };

export function voiceSessionReducer(
  state: VoiceSessionState,
  action: VoiceSessionAction,
): VoiceSessionState {
  switch (action.type) {
    case "CONNECT_START":
      return { ...state, connectionState: "connecting" };

    case "CONNECT_SUCCESS":
      return { ...state, connectionState: "connected", activeConfig: action.config };

    case "DISCONNECT":
      return {
        ...initialState,
        // Keep transcripts so endSession can read them
        transcripts: state.transcripts,
      };

    case "SERVER_STATE": {
      const next: VoiceSessionState = { ...state, agentState: action.state };
      if (action.state === "SPEAKING") {
        next.speakingEnteredAt = Date.now();
      }
      if (action.state !== "SPEAKING") {
        next.ttsActive = false;
      }
      return next;
    }

    case "TTS_STARTED":
      return { ...state, ttsActive: true };

    case "TTS_STOPPED":
      return { ...state, ttsActive: false };

    case "MIC_ACTIVE":
      return { ...state, micActive: action.active };

    case "ADD_TRANSCRIPT": {
      const { item } = action;
      // Replace last interim with new interim (for user speech)
      if (!item.isFinal && !item.isAgent && state.transcripts.length > 0) {
        const last = state.transcripts[state.transcripts.length - 1];
        if (!last.isFinal && !last.isAgent) {
          return {
            ...state,
            transcripts: [...state.transcripts.slice(0, -1), item],
          };
        }
      }
      return { ...state, transcripts: [...state.transcripts, item] };
    }

    case "UPDATE_LAST_AGENT_TRANSCRIPT": {
      let idx = -1;
      for (let i = state.transcripts.length - 1; i >= 0; i--) {
        if (state.transcripts[i].isAgent) { idx = i; break; }
      }
      if (idx === -1) return state;
      const updated = [...state.transcripts];
      updated[idx] = { ...updated[idx], text: action.text };
      return { ...state, transcripts: updated };
    }

    case "COUNT_MESSAGE":
      return { ...state, stats: { ...state.stats, messages: state.stats.messages + 1 } };

    case "COUNT_FINAL":
      return { ...state, stats: { ...state.stats, finals: state.stats.finals + 1 } };

    case "BARGE_IN":
      return { ...state, lastBargeInAt: Date.now() };

    default:
      return state;
  }
}

const BARGE_IN_GRACE_MS = 1500;
const BARGE_IN_COOLDOWN_MS = 1000;

export function canBargeIn(state: VoiceSessionState): boolean {
  if (state.agentState !== "SPEAKING") return false;
  if (!state.ttsActive) return false;
  const now = Date.now();
  if (now - state.speakingEnteredAt < BARGE_IN_GRACE_MS) return false;
  if (now - state.lastBargeInAt < BARGE_IN_COOLDOWN_MS) return false;
  return true;
}
