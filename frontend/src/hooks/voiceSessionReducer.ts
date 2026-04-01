import type { ConnectionState, AgentState, TranscriptItem, SessionConfig } from "./useVoiceSession";

export interface VoiceSessionState {
  connectionState: ConnectionState;
  agentState: AgentState;
  micActive: boolean;
  transcripts: TranscriptItem[];
  conversationHistory: { role: string; content: string }[];
  activeConfig: SessionConfig | null;
  elapsedSeconds: number;
}

export const initialState: VoiceSessionState = {
  connectionState: "disconnected",
  agentState: "LISTENING",
  micActive: false,
  transcripts: [],
  conversationHistory: [],
  activeConfig: null,
  elapsedSeconds: 0,
};

export type VoiceSessionAction =
  | { type: "CONNECT_START" }
  | { type: "CONNECT_SUCCESS"; config: SessionConfig }
  | { type: "DISCONNECT" }
  | { type: "SETTINGS_APPLIED" }
  | { type: "AGENT_LISTENING" }
  | { type: "AGENT_THINKING" }
  | { type: "AGENT_SPEAKING" }
  | { type: "MIC_ACTIVE"; active: boolean }
  | { type: "ADD_CONVERSATION_TEXT"; item: TranscriptItem; role: string; content: string }
  | { type: "TICK_ELAPSED" }
  | { type: "SET_DURATION"; durationMinutes: number | null };

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
      return { ...initialState };

    case "SETTINGS_APPLIED":
      return state;

    case "AGENT_LISTENING":
      return { ...state, agentState: "LISTENING" };

    case "AGENT_THINKING":
      return { ...state, agentState: "THINKING" };

    case "AGENT_SPEAKING":
      return { ...state, agentState: "SPEAKING" };

    case "MIC_ACTIVE":
      return { ...state, micActive: action.active };

    case "ADD_CONVERSATION_TEXT":
      return {
        ...state,
        transcripts: [...state.transcripts, action.item],
        conversationHistory: [
          ...state.conversationHistory,
          { role: action.role, content: action.content },
        ],
      };

    case "TICK_ELAPSED":
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    case "SET_DURATION":
      return {
        ...state,
        activeConfig: state.activeConfig
          ? { ...state.activeConfig, durationMinutes: action.durationMinutes }
          : null,
      };

    default:
      return state;
  }
}
