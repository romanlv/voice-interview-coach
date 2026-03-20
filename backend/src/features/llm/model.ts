import Anthropic from "@anthropic-ai/sdk";
import { ChatAnthropic } from "@langchain/anthropic";

const useOAuth = !!process.env.ANTHROPIC_AUTH_TOKEN;

const OAUTH_BETAS = ["claude-code-20250219", "oauth-2025-04-20"];
const CLAUDE_CODE_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/**
 * Intercept outgoing fetch to masquerade as Claude Code.
 * Required for Opus with OAuth subscription tokens.
 */
function createOAuthFetch() {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);

    // Spoof user-agent
    headers.set("user-agent", "claude-cli/2.1.62");

    // Strip structured-outputs betas that the API rejects with OAuth
    const beta = headers.get("anthropic-beta");
    if (beta) {
      const cleaned = beta
        .split(",")
        .map((b) => b.trim())
        .filter((b) => !b.startsWith("structured-outputs"))
        .join(",");
      headers.set("anthropic-beta", cleaned);
    }

    // Split Claude Code identity into its own system block
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string);
        if (body.system) {
          const systemBlocks = Array.isArray(body.system)
            ? body.system
            : [{ type: "text", text: body.system }];
          // Ensure identity is a standalone first block
          const hasIdentity = systemBlocks.some(
            (b: any) => b.type === "text" && b.text === CLAUDE_CODE_IDENTITY,
          );
          if (hasIdentity) {
            // Already split — keep as-is
          } else if (
            systemBlocks[0]?.type === "text" &&
            systemBlocks[0].text.startsWith(CLAUDE_CODE_IDENTITY)
          ) {
            // Merged into first block — split it out
            const rest = systemBlocks[0].text
              .slice(CLAUDE_CODE_IDENTITY.length)
              .replace(/^\n+/, "");
            systemBlocks.splice(
              0,
              1,
              { type: "text", text: CLAUDE_CODE_IDENTITY },
              { type: "text", text: rest },
            );
          }
          body.system = systemBlocks;
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {
        // Not JSON — pass through
      }
    }

    return fetch(url, { ...init, headers });
  };
}

export function createModel(maxTokens?: number) {
  if (useOAuth) {
    return new ChatAnthropic({
      model: "claude-opus-4-6",
      temperature: 0,
      ...(maxTokens ? { maxTokens } : {}),
      createClient: (opts) =>
        new Anthropic({
          ...opts,
          authToken: process.env.ANTHROPIC_AUTH_TOKEN!,
          defaultHeaders: {
            ...opts.defaultHeaders,
            "anthropic-beta": OAUTH_BETAS.join(","),
            "user-agent": "claude-cli/2.1.62",
            "x-app": "cli",
          },
          fetch: createOAuthFetch() as unknown as typeof fetch,
        }),
    });
  }
  return new ChatAnthropic({
    model: "claude-opus-4-6",
    temperature: 0,
    ...(maxTokens ? { maxTokens } : {}),
  });
}

/**
 * Returns the Claude Code identity prefix when OAuth is active.
 * Must be prepended to system prompts for the API to accept OAuth tokens.
 */
export function getSystemPromptPrefix(): string {
  return useOAuth ? `${CLAUDE_CODE_IDENTITY}\n\n` : "";
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
  const cleaned = text
    .trim()
    .replace(/^```json?\n?/, "")
    .replace(/\n?```$/, "");
  return JSON.parse(cleaned);
}
