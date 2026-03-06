import type { ServerWebSocket } from "bun";
import type { AgentState, StateMessage } from "./protocol.ts";

export class VoiceStateMachine {
  private state: AgentState = "LISTENING";

  constructor(private ws: ServerWebSocket<any>) {}

  get current(): AgentState {
    return this.state;
  }

  transition(newState: AgentState) {
    if (this.state === newState) return;
    console.log(`State: ${this.state} → ${newState}`);
    this.state = newState;
    const msg: StateMessage = { type: "state", state: newState };
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
