export type AgentState = "LISTENING" | "THINKING" | "SPEAKING";

export type StateMessage = {
  type: "state";
  state: AgentState;
};

export type AgentResponseMessage = {
  type: "agent_response";
  text: string;
};

export type TtsEndMessage = {
  type: "tts_end";
};

export type InterruptMessage = {
  type: "interrupt";
};

export type ServerMessage = StateMessage | AgentResponseMessage | TtsEndMessage;
export type ClientMessage = InterruptMessage;
