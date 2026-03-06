import type { ServerWebSocket } from "bun";

type SttCallbacks = {
  onTranscript: (data: any) => void;
  onUtteranceEnd: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (event: Event) => void;
};

export function createDeepgramSTT(
  apiKey: string,
  params: URLSearchParams,
  callbacks: SttCallbacks,
): WebSocket {
  const dgParams = new URLSearchParams({
    model: params.get("model") || "nova-3",
    language: params.get("language") || "en",
    encoding: params.get("encoding") || "linear16",
    sample_rate: params.get("sample_rate") || "16000",
    channels: params.get("channels") || "1",
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
    utterance_end_ms: "1000",
    endpointing: "500",
  });

  const dgUrl = `wss://api.deepgram.com/v1/listen?${dgParams}`;
  const dgWs = new WebSocket(dgUrl, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  dgWs.binaryType = "arraybuffer";

  dgWs.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === "UtteranceEnd") {
        callbacks.onUtteranceEnd();
      } else {
        callbacks.onTranscript(data);
      }
    } catch {
      // ignore parse errors
    }
  });

  dgWs.addEventListener("close", (event) => {
    callbacks.onClose(event.code, event.reason);
  });

  dgWs.addEventListener("error", (event) => {
    callbacks.onError(event);
  });

  return dgWs;
}
