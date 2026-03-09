import { DeepgramClient } from "@deepgram/sdk";
import { listCandidates, loadResume } from "./features/storage/candidates.ts";
import { listInterviewers, loadInterviewer } from "./features/storage/interviewers.ts";
import { listPositions, loadPosition } from "./features/storage/positions.ts";
import { saveSession } from "./features/storage/session-writer.ts";
import { loadNotes, generateAndMergeNotes } from "./features/storage/notes.ts";
import { generateSessionSummary } from "./features/llm/client.ts";
import { buildSystemPrompt } from "./features/llm/prompts.ts";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  console.error("DEEPGRAM_API_KEY is required");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is required");
  process.exit(1);
}

const deepgram = new DeepgramClient({ apiKey: DEEPGRAM_API_KEY });

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 8081;

const server = Bun.serve({
  hostname: HOST,
  port: PORT,

  routes: {
    "/api/deepgram-token": {
      GET: async () => {
        try {
          const tokenData = await deepgram.auth.v1.tokens.grant();
          return Response.json({ access_token: tokenData.access_token });
        } catch (err) {
          console.error("Token generation error:", err);
          return Response.json(
            { error: "Failed to generate token" },
            { status: 500 },
          );
        }
      },
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

  fetch(req) {
    const url = new URL(req.url);

    // GET /api/prompt?candidate=X&interviewer=Y&position=Z&mode=M
    if (url.pathname === "/api/prompt" && req.method === "GET") {
      return (async () => {
        try {
          const candidateSlug = url.searchParams.get("candidate") || "";
          const interviewerSlug = url.searchParams.get("interviewer") || "";
          const positionSlug = url.searchParams.get("position") || "";
          const mode = (url.searchParams.get("mode") || "interview") as
            | "practice"
            | "interview";

          const interviewerContent = interviewerSlug
            ? await loadInterviewer(interviewerSlug)
            : "";
          const resumeContent = candidateSlug
            ? await loadResume(candidateSlug)
            : "";
          const positionContent = positionSlug
            ? await loadPosition(positionSlug)
            : undefined;

          const prompt = buildSystemPrompt({
            interviewer: interviewerContent,
            resume: resumeContent,
            position: positionContent,
            mode,
          });

          return Response.json({ prompt });
        } catch (err) {
          console.error("Prompt generation error:", err);
          return Response.json(
            { error: "Failed to generate prompt" },
            { status: 500 },
          );
        }
      })();
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on ${HOST}:${PORT}`);
