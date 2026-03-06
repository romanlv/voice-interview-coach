import type { ServerWebSocket } from "bun";

export async function streamTTS(
  text: string,
  ws: ServerWebSocket<any>,
  apiKey: string,
  abortSignal?: AbortSignal,
  voice: string = "thalia",
): Promise<void> {
  const url = `https://api.deepgram.com/v1/speak?model=aura-2-${voice}-en&encoding=linear16&sample_rate=24000&container=none`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TTS failed: ${response.status} ${response.statusText} ${body}`);
  }

  console.log("TTS response content-type:", response.headers.get("content-type"));

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from TTS");

  let totalBytes = 0;
  let chunkCount = 0;
  let aborted = false;
  try {
    while (true) {
      if (abortSignal?.aborted) {
        aborted = true;
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      chunkCount++;
      totalBytes += value.byteLength;
      if (ws.readyState === 1) {
        ws.sendBinary(new Uint8Array(value));
      } else {
        console.warn(`TTS: ws not open (readyState=${ws.readyState}) at chunk #${chunkCount}, stopping`);
        break;
      }
    }
  } finally {
    console.log(`TTS done: ${chunkCount} chunks, ${totalBytes} bytes, aborted=${aborted}, wsOpen=${ws.readyState === 1}`);
    reader.releaseLock();
  }

  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "tts_end" }));
  }
}
