import { useReducer, useRef, useCallback, useState, useEffect } from "react";
import { TTSPlayer } from "../features/audio/tts-player";
import {
  initAudioContext,
  startMicrophone,
  stopMicrophone,
  getMicAnalyser,
} from "../features/audio/mic-capture";
import {
  EVT_SETTINGS_APPLIED,
  EVT_CONVERSATION_TEXT,
  EVT_USER_STARTED_SPEAKING,
  EVT_AGENT_STARTED_SPEAKING,
  EVT_AGENT_AUDIO_DONE,
  EVT_END_OF_THOUGHT,
  EVT_INJECTION_REFUSED,
} from "../features/connection/protocol";
import { voiceSessionReducer, initialState, type VoiceSessionState } from "./voiceSessionReducer";

export interface TranscriptItem {
  id: number;
  text: string;
  isFinal: boolean;
  isAgent: boolean;
  timestamp: string;
}

export interface SessionConfig {
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

const KEEPALIVE_INTERVAL_MS = 10_000;
const SILENCE_TIMEOUT_MS = 15_000;
const MAX_NUDGES_BEFORE_WRAP_UP = 3;

export function useVoiceSession() {
  const [state, dispatch] = useReducer(voiceSessionReducer, initialState);
  const stateRef = useRef<VoiceSessionState>(initialState);
  stateRef.current = state;

  const [agentAnalyser, setAgentAnalyser] = useState<AnalyserNode | null>(null);
  const [userAnalyser, setUserAnalyser] = useState<AnalyserNode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ttsRef = useRef<TTSPlayer>(new TTSPlayer());
  const startTimeRef = useRef<number>(0);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeCountRef = useRef<number>(0);
  const waitingForAgentAudioDrainRef = useRef<boolean>(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    silenceTimerRef.current = setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (waitingForAgentAudioDrainRef.current) return;
      if (stateRef.current.agentState !== "LISTENING") return;
      if (ttsRef.current.remainingTime() > 0) return;

      const content =
        nudgeCountRef.current >= MAX_NUDGES_BEFORE_WRAP_UP
          ? "It seems like you might need a moment. Would you like to continue, or shall we wrap up for today?"
          : "Take your time. Would you like me to rephrase the question?";

      console.log({ type: "InjectAgentMessage", content });
      wsRef.current.send(JSON.stringify({ type: "InjectAgentMessage", content }));
      nudgeCountRef.current++;
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  useEffect(() => {
    const tts = ttsRef.current;

    tts.onPlayStart = () => {
      dispatch({ type: "AGENT_SPEAKING" });
      clearSilenceTimer();
    };

    tts.onPlayStop = () => {
      if (!waitingForAgentAudioDrainRef.current) return;
      waitingForAgentAudioDrainRef.current = false;
      dispatch({ type: "AGENT_LISTENING" });
      resetSilenceTimer();
    };

    return () => {
      tts.onPlayStart = null;
      tts.onPlayStop = null;
    };
  }, [clearSilenceTimer, resetSilenceTimer]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Binary = TTS audio from Deepgram agent
      if (event.data instanceof ArrayBuffer) {
        ttsRef.current.playChunk(event.data);
        return;
      }

      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case EVT_SETTINGS_APPLIED:
            dispatch({ type: "SETTINGS_APPLIED" });
            // Trigger initial greeting via InjectAgentMessage (bypasses LLM, goes straight to TTS)
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: "InjectAgentMessage",
                  content:
                    "Hello! Thanks for joining. To get started, could you tell me a little about yourself?",
                }),
              );
            }
            break;

          case EVT_CONVERSATION_TEXT: {
            const isAgent = data.role === "assistant";
            const item: TranscriptItem = {
              id: nextId++,
              text: data.content,
              isFinal: true,
              isAgent,
              timestamp: (isAgent ? "AI - " : "") + new Date().toLocaleTimeString(),
            };
            dispatch({
              type: "ADD_CONVERSATION_TEXT",
              item,
              role: data.role,
              content: data.content,
            });
            // User finished an utterance — start silence timer in case
            // the agent doesn't respond (e.g. utterance too short).
            // Timer is cleared when agent starts speaking.
            if (!isAgent && ttsRef.current.remainingTime() <= 0) resetSilenceTimer();
            break;
          }

          case EVT_USER_STARTED_SPEAKING:
            dispatch({ type: "AGENT_LISTENING" });
            waitingForAgentAudioDrainRef.current = false;
            ttsRef.current.stop();
            nudgeCountRef.current = 0;
            clearSilenceTimer();
            break;

          case EVT_AGENT_STARTED_SPEAKING:
            dispatch({ type: "AGENT_SPEAKING" });
            waitingForAgentAudioDrainRef.current = false;
            clearSilenceTimer();
            break;

          case EVT_AGENT_AUDIO_DONE: {
            // Wait until local playback is fully drained before opening the
            // response window for silence nudges.
            waitingForAgentAudioDrainRef.current = true;
            if (ttsRef.current.remainingTime() <= 0) {
              waitingForAgentAudioDrainRef.current = false;
              dispatch({ type: "AGENT_LISTENING" });
              resetSilenceTimer();
            }
            break;
          }

          case EVT_INJECTION_REFUSED:
            resetSilenceTimer();
            break;

          case EVT_END_OF_THOUGHT:
            // Agent finished thinking, will start speaking soon
            break;
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    },
    [resetSilenceTimer, clearSilenceTimer],
  );

  const connect = useCallback(
    async (config: SessionConfig) => {
      dispatch({ type: "CONNECT_START" });
      startTimeRef.current = Date.now();
      clearSilenceTimer();
      waitingForAgentAudioDrainRef.current = false;
      nudgeCountRef.current = 0;

      try {
        // 1. Fetch system prompt
        const promptParams = new URLSearchParams({
          candidate: config.candidate,
          interviewer: config.interviewer,
          mode: config.mode,
        });
        if (config.position) {
          promptParams.set("position", config.position);
        }
        const promptRes = await fetch(`api/prompt?${promptParams}`);
        if (!promptRes.ok) throw new Error(`Prompt fetch failed: ${promptRes.status}`);
        const { prompt } = await promptRes.json();

        // 2. Fetch Deepgram token
        const tokenRes = await fetch("api/deepgram-token");
        if (!tokenRes.ok) throw new Error(`Token fetch failed: ${tokenRes.status}`);
        const { access_token } = await tokenRes.json();

        // 3. Init TTS player and audio context
        await ttsRef.current.init();
        await initAudioContext();

        // 4. Connect to Deepgram Voice Agent
        const ws = new WebSocket("wss://agent.deepgram.com/v1/agent/converse", [
          "bearer",
          access_token,
        ]);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => {
            // Send Settings message
            ws.send(
              JSON.stringify({
                type: "Settings",
                audio: {
                  input: { encoding: "linear16", sample_rate: 16000 },
                  output: {
                    encoding: "linear16",
                    sample_rate: 24000,
                    container: "none",
                  },
                },
                agent: {
                  listen: {
                    provider: { type: "deepgram", model: "nova-3" },
                  },
                  think: {
                    provider: {
                      type: "google",
                      model: "gemini-3-flash-preview",
                    },
                    prompt,
                  },
                  speak: {
                    provider: {
                      type: "deepgram",
                      model: `aura-2-${config.ttsVoice || "thalia"}-en`,
                    },
                  },
                },
              }),
            );
            resolve();
          };
          ws.onerror = (e) => reject(e);
          ws.onmessage = handleMessage;
          ws.onclose = () => {
            wsRef.current = null;
            if (keepAliveRef.current) {
              clearInterval(keepAliveRef.current);
              keepAliveRef.current = null;
            }
            dispatch({ type: "DISCONNECT" });
          };
        });

        // 5. Start KeepAlive interval
        keepAliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, KEEPALIVE_INTERVAL_MS);

        dispatch({ type: "CONNECT_SUCCESS", config });

        // 6. Start microphone — stream audio to Deepgram
        await startMicrophone((buffer: ArrayBuffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
          }
        });

        dispatch({ type: "MIC_ACTIVE", active: true });

        setAgentAnalyser(ttsRef.current.getAnalyser());
        setUserAnalyser(getMicAnalyser());
      } catch (error) {
        console.error("Connection error:", error);
        dispatch({ type: "DISCONNECT" });
        throw error;
      }
    },
    [handleMessage, clearSilenceTimer],
  );

  const disconnect = useCallback(() => {
    clearSilenceTimer();
    waitingForAgentAudioDrainRef.current = false;
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
    ttsRef.current.stop();
    stopMicrophone();
    setAgentAnalyser(null);
    setUserAnalyser(null);
    dispatch({ type: "DISCONNECT" });
  }, [clearSilenceTimer]);

  const endSession = useCallback(async (): Promise<SessionSummary | null> => {
    const currentState = stateRef.current;
    if (!currentState.activeConfig) return null;

    const history = currentState.conversationHistory;

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
    activeConfig: state.activeConfig,
    agentAnalyser,
    userAnalyser,
    connect,
    disconnect,
    endSession,
  };
}
