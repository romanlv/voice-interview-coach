import Anthropic from "@anthropic-ai/sdk";
import { ChatAnthropic } from "@langchain/anthropic";

const useOAuth = !!process.env.ANTHROPIC_AUTH_TOKEN;

export function createModel(maxTokens?: number) {
  if (useOAuth) {
    return new ChatAnthropic({
      model: "claude-sonnet-4-20250514",
      temperature: 0,
      ...(maxTokens ? { maxTokens } : {}),
      createClient: (opts) =>
        new Anthropic({
          ...opts,
          authToken: process.env.ANTHROPIC_AUTH_TOKEN!,
          defaultHeaders: {
            ...opts.defaultHeaders,
            "anthropic-beta": "oauth-2025-04-20",
          },
        }),
    });
  }
  return new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    temperature: 0,
    ...(maxTokens ? { maxTokens } : {}),
  });
}

export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  return String(content);
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(cleaned);
}
