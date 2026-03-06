import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompts.ts";
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
  abortSignal?: AbortSignal,
): Promise<string> {
  history.addUserTurn(transcript);

  const systemPrompt = buildSystemPrompt();
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
