import type { ServerWebSocket } from "bun";
import { createDeepgramSTT } from "./stt.ts";
import { VoiceStateMachine } from "./state-machine.ts";
import { ConversationHistory } from "../llm/history.ts";
import { queryLLM } from "../llm/client.ts";
import { streamTTS } from "./tts.ts";
import { buildSystemPrompt } from "../llm/prompts.ts";
import { loadInterviewer } from "../storage/interviewers.ts";
import { loadResume } from "../storage/candidates.ts";
import { loadPosition } from "../storage/positions.ts";
import { saveSession } from "../storage/session-writer.ts";

const SILENCE_TIMEOUT_MS = 15_000;
const LONG_PAUSE_THRESHOLD_MS = 5_000;

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
  systemPrompt: string;
  promptReady: Promise<void> | null;
  candidate: string;
  interviewer: string;
  position: string;
  mode: string;
  silenceTimer: ReturnType<typeof setTimeout> | null;
  lastListeningStart: number;
  speechDetected: boolean;
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
    systemPrompt: "",
    promptReady: null,
    silenceTimer: null,
    lastListeningStart: 0,
    speechDetected: false,
    candidate: queryParams.get("candidate") || "",
    interviewer: queryParams.get("interviewer") || "",
    position: queryParams.get("position") || "",
    mode: queryParams.get("mode") || "interview",
  };
}

async function loadPromptConfig(ws: ServerWebSocket<WsData>): Promise<void> {
  try {
    const interviewerContent = ws.data.interviewer
      ? await loadInterviewer(ws.data.interviewer)
      : "";
    const resumeContent = ws.data.candidate
      ? await loadResume(ws.data.candidate)
      : "";
    const positionContent = ws.data.position
      ? await loadPosition(ws.data.position)
      : undefined;

    ws.data.systemPrompt = buildSystemPrompt({
      interviewer: interviewerContent,
      resume: resumeContent,
      position: positionContent,
      mode: ws.data.mode as "practice" | "interview",
    });
  } catch (err) {
    console.error("Failed to load prompt config:", err);
    ws.data.systemPrompt = buildSystemPrompt({
      interviewer: "You are a general interviewer.",
      resume: "",
      mode: "interview",
    });
  }
}

function clearSilenceTimer(ws: ServerWebSocket<WsData>) {
  if (ws.data.silenceTimer) {
    clearTimeout(ws.data.silenceTimer);
    ws.data.silenceTimer = null;
  }
}

function startSilenceTimer(ws: ServerWebSocket<WsData>, apiKey: string) {
  clearSilenceTimer(ws);
  ws.data.lastListeningStart = Date.now();
  ws.data.speechDetected = false;
  ws.data.silenceTimer = setTimeout(() => {
    ws.data.silenceTimer = null;
    if (
      ws.readyState === 1 &&
      ws.data.stateMachine?.current === "LISTENING" &&
      !ws.data.speechDetected
    ) {
      console.log("Silence timeout — prompting interviewer to follow up");
      processUserTurn(ws, "[candidate is silent]", apiKey);
    }
  }, SILENCE_TIMEOUT_MS);
}

export function handleOpen(ws: ServerWebSocket<WsData>, apiKey: string) {
  console.log("Client connected");

  const stateMachine = new VoiceStateMachine(ws);
  ws.data.stateMachine = stateMachine;

  // Load config in background — Deepgram connects immediately so no audio is dropped.
  // processUserTurn awaits promptReady before calling LLM.
  ws.data.promptReady = loadPromptConfig(ws);

  const dgWs = createDeepgramSTT(apiKey, ws.data.queryParams, {
    onTranscript: (data) => {
      if (ws.readyState !== 1) return;

      // Forward transcript to client
      ws.send(JSON.stringify(data));

      // Mark that we've heard speech (for silence timer)
      const transcript =
        data.channel?.alternatives?.[0]?.transcript || "";
      if (transcript && !ws.data.speechDetected) {
        ws.data.speechDetected = true;
        clearSilenceTimer(ws);
      }

      // Accumulate final transcripts
      if (data.is_final && transcript) {
        ws.data.pendingTranscript +=
          (ws.data.pendingTranscript ? " " : "") + transcript;
      }
    },
    onUtteranceEnd: () => {
      const text = ws.data.pendingTranscript.trim();
      if (!text) return;
      ws.data.pendingTranscript = "";

      // Annotate long pauses
      const pauseMs = ws.data.lastListeningStart
        ? Date.now() - ws.data.lastListeningStart
        : 0;
      const annotated =
        pauseMs >= LONG_PAUSE_THRESHOLD_MS
          ? `[responded after ${Math.round(pauseMs / 1000)}s] ${text}`
          : text;

      processUserTurn(ws, annotated, apiKey);
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
    // Ensure prompt is loaded before first LLM call
    if (ws.data.promptReady) await ws.data.promptReady;

    const responseText = await queryLLM(
      text,
      ws.data.history,
      ws.data.systemPrompt,
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
      startSilenceTimer(ws, apiKey);
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
    clearSilenceTimer(ws);
    if (ws.data.abortController) {
      ws.data.abortController.abort();
      ws.data.abortController = null;
    }
    sm.transition("LISTENING");
  }
}

export function handleClose(ws: ServerWebSocket<WsData>) {
  console.log("Client disconnected");
  clearSilenceTimer(ws);
  if (ws.data.abortController) {
    ws.data.abortController.abort();
    ws.data.abortController = null;
  }

  // Save session transcript (fire-and-forget)
  const messages = ws.data.history.getMessages();
  if (messages.length > 0 && ws.data.candidate) {
    saveSession({
      candidate: ws.data.candidate,
      interviewer: ws.data.interviewer,
      position: ws.data.position || undefined,
      mode: ws.data.mode,
      startTime: ws.data.createdAt,
      history: messages,
    }).catch((err) => console.error("Failed to save session on close:", err));
  }

  const dgWs = ws.data.deepgramWs;
  if (dgWs && dgWs.readyState === WebSocket.OPEN) {
    dgWs.close(1000, "Client disconnected");
  }
  ws.data.deepgramWs = null;
  ws.data.audioBuffer = [];
}
