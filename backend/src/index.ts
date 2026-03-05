import { sign, verifySync } from "./jwt.ts";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  console.error("DEEPGRAM_API_KEY is required");
  process.exit(1);
}

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomUUID();
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 8081;

type WsData = {
  createdAt: number;
  deepgramWs: WebSocket | null;
  deepgramReady: boolean;
  audioBuffer: (string | ArrayBuffer | Uint8Array)[];
  queryParams: URLSearchParams;
};

const server = Bun.serve({
  hostname: HOST,
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);
    console.log("req", url.pathname);

    // --- REST endpoints ---

    if (url.pathname === "/api/session" && req.method === "GET") {
      return (async () => {
        const token = await sign({ iat: Date.now() }, SESSION_SECRET);
        console.log({ token });
        return Response.json({ token });
      })();
    }

    if (url.pathname === "/api/metadata" && req.method === "GET") {
      return Response.json({
        title: "AI Interview Coach",
        description: "Voice-based AI interview practice",
        repository:
          "https://github.com/deepgram-starters/live-transcription-html",
      });
    }

    // --- WebSocket upgrade (must be synchronous) ---

    if (url.pathname === "/api/live-transcription") {
      const protocols = req.headers.get("sec-websocket-protocol") || "";
      const tokenProtocol = protocols
        .split(",")
        .map((p) => p.trim())
        .find((p) => p.startsWith("access_token."));

      if (!tokenProtocol) {
        return new Response("Missing auth token", { status: 401 });
      }

      const token = tokenProtocol.replace("access_token.", "");
      if (!verifySync(token, SESSION_SECRET)) {
        return new Response("Invalid token", { status: 401 });
      }

      const upgraded = server.upgrade(req, {
        data: {
          createdAt: Date.now(),
          deepgramWs: null,
          deepgramReady: false,
          audioBuffer: [],
          queryParams: url.searchParams,
        },
      });

      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return undefined;
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    data: {} as WsData,
    open(ws) {
      console.log("Client connected");

      const params = ws.data.queryParams;
      const dgParams = new URLSearchParams({
        model: params.get("model") || "nova-3",
        language: params.get("language") || "en",
        encoding: params.get("encoding") || "linear16",
        sample_rate: params.get("sample_rate") || "16000",
        channels: params.get("channels") || "1",
        interim_results: "true",
        punctuate: "true",
        smart_format: "true",
      });

      const dgUrl = `wss://api.deepgram.com/v1/listen?${dgParams}`;
      const dgWs = new WebSocket(dgUrl, {
        headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      });

      dgWs.binaryType = "arraybuffer";
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

      dgWs.addEventListener("message", (event) => {
        if (ws.readyState === 1) {
          if (typeof event.data === "string") {
            ws.send(event.data);
          } else {
            ws.send(event.data as ArrayBuffer);
          }
        }
      });

      dgWs.addEventListener("close", (event) => {
        console.log(`Deepgram closed: ${event.code} ${event.reason}`);
        if (ws.readyState === 1) {
          ws.close(1000, "Deepgram connection closed");
        }
      });

      dgWs.addEventListener("error", (event) => {
        console.error("Deepgram error:", event);
        if (ws.readyState === 1) {
          ws.close(1011, "Deepgram error");
        }
      });
    },

    message(ws, message) {
      const dgWs = ws.data.deepgramWs;
      if (!dgWs) return;

      if (ws.data.deepgramReady && dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(message);
      } else {
        ws.data.audioBuffer.push(message);
      }
    },

    close(ws, code, reason) {
      console.log(`Client disconnected: ${code} ${reason}`);
      const dgWs = ws.data.deepgramWs;
      if (dgWs && dgWs.readyState === WebSocket.OPEN) {
        dgWs.close(1000, "Client disconnected");
      }
      ws.data.deepgramWs = null;
      ws.data.audioBuffer = [];
    },
  },
});

console.log(`Server listening on ${HOST}:${PORT}`);
