import { useReducer, useRef, useCallback } from "react";
import { TTSPlayer } from "../features/audio/tts-player.js";
import {
  initAudioContext,
  startMicrophone,
  stopMicrophone,
} from "../features/audio/mic-capture.js";
import {
  MSG_STATE,
  MSG_AGENT_RESPONSE,
  MSG_AGENT_RESPONSE_INTERRUPTED,
  MSG_TTS_END,
  MSG_INTERRUPT,
} from "../features/connection/protocol.js";
import {
  voiceSessionReducer,
  initialState,
  canBargeIn,
  type VoiceSessionState,
} from "./voiceSessionReducer";

export interface TranscriptItem {
  id: number;
  text: string;
  isFinal: boolean;
  isAgent: boolean;
  timestamp: string;
}

export interface SessionConfig {
  model: string;
  language: string;
  ttsVoice: string;
  candidate: string;
  interviewer: string;
  position: string;
  mode: "practice" | "interview";
}

export interface SessionSummary {
  score: number;
  strengths: string[];
  needsWork: string[];
  nextSteps: string[];
  summary: string;
}

export type ConnectionState = "disconnected" | "connecting" | "connected";
export type AgentState = "LISTENING" | "THINKING" | "SPEAKING";

let nextId = 0;

export function useVoiceSession() {
  const [state, dispatch] = useReducer(voiceSessionReducer, initialState);
  const stateRef = useRef<VoiceSessionState>(initialState);

  // Keep stateRef in sync — assigned after every render
  stateRef.current = state;

  const wsRef = useRef<WebSocket | null>(null);
  const ttsRef = useRef<TTSPlayer>(new TTSPlayer());
  const sessionTokenRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);

  // Wire TTS player callbacks (stable — only depends on dispatch)
  const tts = ttsRef.current;
  tts.onPlayStart = () => dispatch({ type: "TTS_STARTED" });
  tts.onPlayStop = () => dispatch({ type: "TTS_STOPPED" });

  const getSessionToken = useCallback(async () => {
    if (sessionTokenRef.current) return sessionTokenRef.current;
    const response = await fetch("api/session");
    if (!response.ok) throw new Error(`Session failed: ${response.status}`);
    const data = await response.json();
    sessionTokenRef.current = data.token;
    return data.token;
  }, []);

  const sendInterrupt = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: MSG_INTERRUPT }));
    }
  }, []);

  const handleVadRms = useCallback(
    (rms: number) => {
      if (rms < 0.02) return;
      if (!canBargeIn(stateRef.current)) return;
      dispatch({ type: "BARGE_IN" });
      console.log(`VAD barge-in triggered (RMS=${rms.toFixed(3)})`);
      ttsRef.current.stop();
      sendInterrupt();
    },
    [sendInterrupt],
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Binary = TTS audio
      if (event.data instanceof ArrayBuffer) {
        ttsRef.current.playChunk(event.data);
        return;
      }

      try {
        const data = JSON.parse(event.data);

        if (data.type === MSG_STATE) {
          dispatch({ type: "SERVER_STATE", state: data.state });
          return;
        }

        if (data.type === MSG_AGENT_RESPONSE) {
          const item: TranscriptItem = {
            id: nextId++,
            text: data.text,
            isFinal: true,
            isAgent: true,
            timestamp: "AI - " + new Date().toLocaleTimeString(),
          };
          dispatch({ type: "ADD_TRANSCRIPT", item });
          return;
        }

        if (data.type === MSG_AGENT_RESPONSE_INTERRUPTED) {
          dispatch({ type: "UPDATE_LAST_AGENT_TRANSCRIPT", text: data.text });
          return;
        }

        if (data.type === MSG_TTS_END) {
          return;
        }

        // Deepgram transcript
        dispatch({ type: "COUNT_MESSAGE" });

        if (data.type === "Results" || data.channel) {
          const transcript =
            data.channel?.alternatives?.[0]?.transcript || "";
          const isFinal = data.is_final || false;

          if (transcript) {
            const item: TranscriptItem = {
              id: nextId++,
              text: transcript,
              isFinal,
              isAgent: false,
              timestamp: new Date().toLocaleTimeString(),
            };
            dispatch({ type: "ADD_TRANSCRIPT", item });

            if (isFinal) {
              dispatch({ type: "COUNT_FINAL" });

              // Transcript-based barge-in
              if (canBargeIn(stateRef.current)) {
                dispatch({ type: "BARGE_IN" });
                ttsRef.current.stop();
                sendInterrupt();
              }
            }
          }
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    },
    [sendInterrupt],
  );

  const connect = useCallback(
    async (config: SessionConfig) => {
      dispatch({ type: "CONNECT_START" });
      startTimeRef.current = Date.now();
      try {
        const token = await getSessionToken();

        const params = new URLSearchParams({
          model: config.model,
          language: config.language,
          encoding: "linear16",
          sample_rate: "16000",
          channels: "1",
          tts_voice: config.ttsVoice || "thalia",
          candidate: config.candidate,
          interviewer: config.interviewer,
          mode: config.mode,
        });
        if (config.position) {
          params.set("position", config.position);
        }
        const wsUrl = new URL(`api/voice?${params}`, document.baseURI);
        wsUrl.protocol =
          wsUrl.protocol === "https:" ? "wss:" : "ws:";

        await ttsRef.current.init();

        const ws = new WebSocket(wsUrl.href, [
          `access_token.${token}`,
        ]);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = (e) => reject(e);
          ws.onmessage = handleMessage;
          ws.onclose = (event) => {
            wsRef.current = null;
            dispatch({ type: "SERVER_STATE", state: "LISTENING" });
            if (event.code === 4401) {
              sessionTokenRef.current = null;
            }
            setTimeout(() => {
              dispatch({ type: "DISCONNECT" });
            }, 2000);
          };
        });

        dispatch({ type: "CONNECT_SUCCESS", config });
        await initAudioContext();
        await startMicrophone((buffer: ArrayBuffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
          }
        }, handleVadRms);

        dispatch({ type: "MIC_ACTIVE", active: true });
      } catch (error) {
        console.error("Connection error:", error);
        dispatch({ type: "DISCONNECT" });
        throw error;
      }
    },
    [getSessionToken, handleMessage, handleVadRms],
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
    ttsRef.current.stop();
    stopMicrophone();
    dispatch({ type: "DISCONNECT" });
  }, []);

  const endSession = useCallback(async (): Promise<SessionSummary | null> => {
    const currentState = stateRef.current;
    if (!currentState.activeConfig) return null;

    const history = currentState.transcripts
      .filter((t) => t.isFinal)
      .map((t) => ({
        role: t.isAgent ? "assistant" : "user",
        content: t.text,
      }));

    disconnect();

    if (history.length === 0) return null;

    const response = await fetch("api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate: currentState.activeConfig.candidate,
        interviewer: currentState.activeConfig.interviewer,
        position: currentState.activeConfig.position || undefined,
        mode: currentState.activeConfig.mode,
        startTime: startTimeRef.current,
        history,
      }),
    });

    if (!response.ok) throw new Error("Failed to end session");
    return response.json();
  }, [disconnect]);

  return {
    connectionState: state.connectionState,
    agentState: state.agentState,
    micActive: state.micActive,
    transcripts: state.transcripts,
    stats: state.stats,
    activeConfig: state.activeConfig,
    connect,
    disconnect,
    endSession,
  };
}
