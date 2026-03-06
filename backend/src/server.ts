import { verifySync } from "./features/auth/jwt.ts";
import { handleSession } from "./features/auth/session.ts";
import {
  type WsData,
  createWsData,
  handleOpen,
  handleMessage,
  handleClose,
} from "./features/voice/handler.ts";
import { listCandidates } from "./features/storage/candidates.ts";
import { listInterviewers } from "./features/storage/interviewers.ts";
import { listPositions } from "./features/storage/positions.ts";
import { saveSession } from "./features/storage/session-writer.ts";
import { loadNotes, generateAndMergeNotes } from "./features/storage/notes.ts";
import { generateSessionSummary } from "./features/llm/client.ts";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  console.error("DEEPGRAM_API_KEY is required");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is required");
  process.exit(1);
}

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomUUID();
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 8081;

const server = Bun.serve({
  hostname: HOST,
  port: PORT,

  routes: {
    "/api/session": {
      GET: () => handleSession(SESSION_SECRET)(),
    },

    "/api/metadata": {
      GET: () =>
        Response.json({
          title: "AI Interview Coach",
          description: "Voice-based AI interview practice",
        }),
    },

    "/api/candidates": {
      GET: async () => Response.json(await listCandidates()),
    },

    "/api/interviewers": {
      GET: async () => Response.json(await listInterviewers()),
    },

    "/api/positions": {
      GET: async () => Response.json(await listPositions()),
    },

    "/api/session/end": {
      POST: async (req) => {
        try {
          const body = (await req.json()) as {
            candidate: string;
            interviewer: string;
            position?: string;
            mode: string;
            history: { role: string; content: string }[];
            startTime?: number;
          };
          const { candidate, interviewer, position, mode, history, startTime } =
            body;

          const summary = await generateSessionSummary(history);

          await saveSession({
            candidate,
            interviewer,
            position,
            mode,
            startTime: startTime || Date.now(),
            history,
          });

          const existingNotes = await loadNotes(candidate);
          generateAndMergeNotes(candidate, history, existingNotes).catch(
            (err) => console.error("Notes generation failed:", err),
          );

          return Response.json(summary);
        } catch (err) {
          console.error("Session end error:", err);
          return Response.json(
            { error: "Failed to process session end" },
            { status: 500 },
          );
        }
      },
    },
  },

  // WebSocket upgrade must go through fetch fallback
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/api/voice") {
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
        data: createWsData(url.searchParams),
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
      handleOpen(ws, DEEPGRAM_API_KEY!);
    },
    message(ws, message) {
      handleMessage(ws, message);
    },
    close(ws) {
      handleClose(ws);
    },
  },
});

console.log(`Server listening on ${HOST}:${PORT}`);
