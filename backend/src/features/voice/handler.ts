import type { ServerWebSocket } from "bun";
import { createDeepgramSTT } from "./stt.ts";
import { VoiceStateMachine } from "./state-machine.ts";
import { ConversationHistory } from "../llm/history.ts";
import { queryLLM } from "../llm/client.ts";
import { streamTTS } from "./tts.ts";

export type WsData = {
  createdAt: number;
  deepgramWs: WebSocket | null;
  deepgramReady: boolean;
  audioBuffer: (string | ArrayBuffer | Uint8Array)[];
  queryParams: URLSearchParams;
  stateMachine: VoiceStateMachine | null;
  history: ConversationHistory;
  pendingTranscript: string;
  abortController: AbortController | null;
};

export function createWsData(queryParams: URLSearchParams): WsData {
  return {
    createdAt: Date.now(),
    deepgramWs: null,
    deepgramReady: false,
    audioBuffer: [],
    queryParams,
    stateMachine: null,
    history: new ConversationHistory(),
    pendingTranscript: "",
    abortController: null,
  };
}

export function handleOpen(ws: ServerWebSocket<WsData>, apiKey: string) {
  console.log("Client connected");

  const stateMachine = new VoiceStateMachine(ws);
  ws.data.stateMachine = stateMachine;

  const dgWs = createDeepgramSTT(apiKey, ws.data.queryParams, {
    onTranscript: (data) => {
      if (ws.readyState !== 1) return;

      // Forward transcript to client
      ws.send(JSON.stringify(data));

      // Accumulate final transcripts
      if (data.is_final) {
        const transcript =
          data.channel?.alternatives?.[0]?.transcript || "";
        if (transcript) {
          ws.data.pendingTranscript +=
            (ws.data.pendingTranscript ? " " : "") + transcript;
        }
      }
    },
    onUtteranceEnd: () => {
      const text = ws.data.pendingTranscript.trim();
      if (!text) return;
      ws.data.pendingTranscript = "";
      processUserTurn(ws, text, apiKey);
    },
    onClose: (code, reason) => {
      console.log(`Deepgram closed: ${code} ${reason}`);
      if (ws.readyState === 1) {
        ws.close(1000, "Deepgram connection closed");
      }
    },
    onError: (event) => {
      console.error("Deepgram error:", event);
      if (ws.readyState === 1) {
        ws.close(1011, "Deepgram error");
      }
    },
  });

  ws.data.deepgramWs = dgWs;

  dgWs.addEventListener("open", () => {
    console.log("Deepgram connected");
    ws.data.deepgramReady = true;

    for (const chunk of ws.data.audioBuffer) {
      dgWs.send(chunk);
    }
    if (ws.data.audioBuffer.length > 0) {
      console.log(`Flushed ${ws.data.audioBuffer.length} buffered chunks`);
    }
    ws.data.audioBuffer = [];
  });
}

async function processUserTurn(
  ws: ServerWebSocket<WsData>,
  text: string,
  apiKey: string,
) {
  const sm = ws.data.stateMachine!;

  // Abort any previous in-flight request
  if (ws.data.abortController) {
    ws.data.abortController.abort();
  }

  const abortController = new AbortController();
  ws.data.abortController = abortController;

  sm.transition("THINKING");

  try {
    const responseText = await queryLLM(
      text,
      ws.data.history,
      abortController.signal,
    );

    if (abortController.signal.aborted) return;

    // Send agent response to client
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "agent_response", text: responseText }));
    }

    // TTS
    sm.transition("SPEAKING");
    const voice = ws.data.queryParams.get("tts_voice") || "thalia";
    await streamTTS(
      responseText,
      ws,
      apiKey,
      abortController.signal,
      voice,
    );
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      console.log("Turn aborted (interrupt)");
      return;
    }
    console.error("Error processing turn:", err);
  } finally {
    if (!abortController.signal.aborted) {
      sm.transition("LISTENING");
    }
    if (ws.data.abortController === abortController) {
      ws.data.abortController = null;
    }
  }
}

export function handleMessage(
  ws: ServerWebSocket<WsData>,
  message: string | ArrayBuffer | Uint8Array,
) {
  // Check for JSON control messages
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === "interrupt") {
        handleInterrupt(ws);
        return;
      }
    } catch {
      // not JSON, ignore
    }
  }

  // Forward audio to Deepgram
  const dgWs = ws.data.deepgramWs;
  if (!dgWs) return;

  if (ws.data.deepgramReady && dgWs.readyState === WebSocket.OPEN) {
    dgWs.send(message);
  } else {
    ws.data.audioBuffer.push(message);
  }
}

function handleInterrupt(ws: ServerWebSocket<WsData>) {
  const sm = ws.data.stateMachine;
  console.log(`Interrupt received — current state: ${sm?.current}`);
  if (!sm) return;

  if (sm.current === "SPEAKING" || sm.current === "THINKING") {
    console.log(`Aborting in-flight request (was ${sm.current})`);
    if (ws.data.abortController) {
      ws.data.abortController.abort();
      ws.data.abortController = null;
    }
    sm.transition("LISTENING");
  }
}

export function handleClose(ws: ServerWebSocket<WsData>) {
  console.log("Client disconnected");
  if (ws.data.abortController) {
    ws.data.abortController.abort();
    ws.data.abortController = null;
  }
  const dgWs = ws.data.deepgramWs;
  if (dgWs && dgWs.readyState === WebSocket.OPEN) {
    dgWs.close(1000, "Client disconnected");
  }
  ws.data.deepgramWs = null;
  ws.data.audioBuffer = [];
}
