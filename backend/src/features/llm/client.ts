import Anthropic from "@anthropic-ai/sdk";
import type { ConversationHistory } from "./history.ts";

const useOAuth = !!process.env.ANTHROPIC_AUTH_TOKEN;

const anthropic = new Anthropic({
  ...(useOAuth
    ? {
        defaultHeaders: {
          "anthropic-beta":
            "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14",
        },
      }
    : {}),
});

const CLAUDE_CODE_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";

export async function queryLLM(
  transcript: string,
  history: ConversationHistory,
  systemPrompt: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  history.addUserTurn(transcript);

  const system = useOAuth
    ? [
        { type: "text" as const, text: CLAUDE_CODE_PREFIX },
        { type: "text" as const, text: systemPrompt },
      ]
    : systemPrompt;

  const response = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system,
      messages: history.getMessages(),
    },
    { signal: abortSignal },
  );

  const raw = response.content[0]!;
  if (raw.type !== "text") {
    throw new Error("Unexpected response type");
  }

  const text = raw.text;
  history.addAssistantTurn(text);

  return text;
}

export interface SessionSummary {
  score: number;
  strengths: string[];
  needsWork: string[];
  nextSteps: string[];
  summary: string;
}

export async function generateSessionSummary(
  history: { role: string; content: string }[],
): Promise<SessionSummary> {
  const transcript = history
    .map(
      (m) =>
        `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content}`,
    )
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    temperature: 1, // required for extended thinking
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
    messages: [
      {
        role: "user",
        content: `You conducted an interview. Here is the transcript:

<transcript>
${transcript}
</transcript>

Analyze the candidate's performance thoroughly. Consider communication clarity, technical depth, behavioral examples, and overall impression.

Respond with ONLY valid JSON (no markdown fences), with these fields:
- score (number 1-10)
- strengths (array of 2-4 strings)
- needsWork (array of 2-4 strings)
- nextSteps (array of 2-3 strings)
- summary (1-2 sentence overall assessment)`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text")
    throw new Error("No text in response");

  return JSON.parse(textBlock.text);
}
