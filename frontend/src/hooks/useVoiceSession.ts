import { useState, useRef, useCallback } from "react";
import { TTSPlayer } from "../features/audio/tts-player.js";
import {
  initAudioContext,
  startMicrophone,
  stopMicrophone,
} from "../features/audio/mic-capture.js";
import {
  MSG_STATE,
  MSG_AGENT_RESPONSE,
  MSG_TTS_END,
  MSG_INTERRUPT,
} from "../features/connection/protocol.js";

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
}

export type ConnectionState = "disconnected" | "connecting" | "connected";
export type AgentState = "LISTENING" | "THINKING" | "SPEAKING";

let nextId = 0;

export function useVoiceSession() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [agentState, setAgentState] = useState<AgentState>("LISTENING");
  const [micActive, setMicActive] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [stats, setStats] = useState({ messages: 0, finals: 0 });
  const [activeConfig, setActiveConfig] = useState<SessionConfig | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ttsRef = useRef<TTSPlayer>(new TTSPlayer());
  const sessionTokenRef = useRef<string | null>(null);
  const agentStateRef = useRef<AgentState>("LISTENING");

  const addTranscript = useCallback(
    (text: string, isFinal: boolean, isAgent: boolean) => {
      const item: TranscriptItem = {
        id: nextId++,
        text,
        isFinal,
        isAgent,
        timestamp: (isAgent ? "AI - " : "") + new Date().toLocaleTimeString(),
      };

      setTranscripts((prev) => {
        // Replace last interim with new interim (for user speech)
        if (!isFinal && !isAgent && prev.length > 0) {
          const last = prev[prev.length - 1];
          if (!last.isFinal && !last.isAgent) {
            return [...prev.slice(0, -1), item];
          }
        }
        return [...prev, item];
      });
    },
    []
  );

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
          agentStateRef.current = data.state;
          setAgentState(data.state);
          return;
        }

        if (data.type === MSG_AGENT_RESPONSE) {
          addTranscript(data.text, true, true);
          return;
        }

        if (data.type === MSG_TTS_END) {
          return;
        }

        // Deepgram transcript
        setStats((prev) => {
          const updated = { ...prev, messages: prev.messages + 1 };
          return updated;
        });

        if (data.type === "Results" || data.channel) {
          const transcript =
            data.channel?.alternatives?.[0]?.transcript || "";
          const isFinal = data.is_final || false;

          if (transcript) {
            addTranscript(transcript, isFinal, false);
            if (isFinal) {
              setStats((prev) => ({ ...prev, finals: prev.finals + 1 }));
            }

            // Barge-in
            if (
              isFinal &&
              transcript &&
              agentStateRef.current === "SPEAKING"
            ) {
              ttsRef.current.stop();
              sendInterrupt();
            }
          }
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    },
    [addTranscript, sendInterrupt]
  );

  const connect = useCallback(
    async (config: SessionConfig) => {
      setConnectionState("connecting");
      try {
        const token = await getSessionToken();

        const params = new URLSearchParams({
          model: config.model,
          language: config.language,
          encoding: "linear16",
          sample_rate: "16000",
          channels: "1",
          tts_voice: config.ttsVoice || "thalia",
        });
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
            agentStateRef.current = "LISTENING";
            setAgentState("LISTENING");
            setStats({ messages: 0, finals: 0 });
            if (event.code === 4401) {
              sessionTokenRef.current = null;
            }
            // Auto-reset after close
            setTimeout(() => {
              setConnectionState("disconnected");
              setMicActive(false);
              setActiveConfig(null);
            }, 2000);
          };
        });

        setActiveConfig(config);
        await initAudioContext();
        await startMicrophone((buffer: ArrayBuffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
          }
        });

        setConnectionState("connected");
        setMicActive(true);
      } catch (error) {
        console.error("Connection error:", error);
        setConnectionState("disconnected");
        throw error;
      }
    },
    [getSessionToken, handleMessage]
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
    ttsRef.current.stop();
    stopMicrophone();
    agentStateRef.current = "LISTENING";
    setAgentState("LISTENING");
    setConnectionState("disconnected");
    setMicActive(false);
    setActiveConfig(null);
    setStats({ messages: 0, finals: 0 });
  }, []);

  return {
    connectionState,
    agentState,
    micActive,
    transcripts,
    stats,
    activeConfig,
    connect,
    disconnect,
  };
}
