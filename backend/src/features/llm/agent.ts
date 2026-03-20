import { resolve } from "node:path";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { createModel, getSystemPromptPrefix, parseJSON } from "./model.ts";
import {
  PRACTICE_SYSTEM_PROMPT,
  INTERVIEW_SYSTEM_PROMPT,
  POST_SESSION_SYSTEM_PROMPT,
} from "./system-prompt.ts";
import type { SessionSummary } from "./types.ts";

const DATA_DIR = resolve(import.meta.dir, "../../../../data");

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function createAgent(systemPrompt: string) {
  return createDeepAgent({
    model: createModel(),
    backend: new FilesystemBackend({ rootDir: DATA_DIR, virtualMode: true }),
    systemPrompt: getSystemPromptPrefix() + systemPrompt,
  });
}

/**
 * Run agent with streaming to log reasoning and tool calls in real-time.
 * Returns the final message content.
 */
async function runAgentWithLogging(
  agent: ReturnType<typeof createAgent>,
  messages: Array<{ role: string; content: string }>,
  label: string,
): Promise<string> {
  console.log(cyan(`\n▸ ${label}`));
  const start = Date.now();

  const stream = await agent.stream(
    { messages },
    { streamMode: "updates" },
  );

  let lastContent = "";

  for await (const chunk of stream) {
    // chunk is { [nodeName]: { messages: [...] } }
    for (const [node, update] of Object.entries(chunk)) {
      const msgs = (update as any)?.messages;
      if (!Array.isArray(msgs)) continue;

      for (const msg of msgs) {
        // Tool calls from the agent
        if (msg.tool_calls?.length) {
          for (const tc of msg.tool_calls) {
            const args = tc.args ?? {};
            const name = tc.name as string;

            if (name === "write_todos") {
              const todos = args.todos as any[];
              if (Array.isArray(todos)) {
                console.log(dim(`  ☐ ${yellow("todos")}`));
                for (const t of todos) {
                  const status = t.status === "completed" ? "✓" : "○";
                  console.log(dim(`    ${status} ${t.content ?? t.description ?? JSON.stringify(t)}`));
                }
              }
            } else if (name === "read_file") {
              console.log(dim(`  ↳ ${yellow("read")} ${args.file_path}`));
            } else if (name === "write_file") {
              console.log(dim(`  ↳ ${yellow("write")} ${args.file_path}`));
            } else if (name === "ls") {
              console.log(dim(`  ↳ ${yellow("ls")} ${args.path || "/"}`));
            } else {
              const preview = Object.entries(args)
                .map(([k, v]) => {
                  const s = typeof v === "string" ? v : JSON.stringify(v);
                  return `${k}=${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
                })
                .join(" ");
              console.log(dim(`  ↳ ${yellow(name)} ${preview}`));
            }
          }
        }

        // Tool results — just show errors, skip verbose output
        if (msg.name && msg.content && node === "tools") {
          const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          if (content.startsWith("Error")) {
            console.log(dim(`  ✗ ${msg.name}: ${content.split("\n")[0]}`));
          }
        }

        // AI text response (reasoning / final answer)
        const text = typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
            : "";
        if (text && msg._getType?.() === "ai" || (msg.constructor?.name === "AIMessage" && text)) {
          lastContent = text;
          // Log first 200 chars of reasoning as preview
          const preview = text.length > 200 ? text.slice(0, 200) + "…" : text;
          console.log(dim(`  💭 ${preview}`));
        }
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(cyan(`  ✓ done in ${elapsed}s\n`));

  return lastContent;
}

// --- Pre-session: generate voice agent prompt ---

export async function generatePrompt(params: {
  candidate: string;
  interviewer: string;
  position?: string;
  positionDescription?: string;
  mode: "practice" | "interview";
}): Promise<string> {
  const { candidate, interviewer, position, positionDescription, mode } = params;

  const systemPrompt =
    mode === "practice" ? PRACTICE_SYSTEM_PROMPT : INTERVIEW_SYSTEM_PROMPT;

  const positionSection = positionDescription
    ? `- **Position description** (provided inline):\n<position-description>\n${positionDescription}\n</position-description>`
    : `- **Position**: ${position || "(none specified)"}`;

  const taskMessage = `Generate a system prompt for the voice agent.

- **Candidate**: ${candidate}
- **Interviewer**: ${interviewer}
${positionSection}

Relevant files:
- \`candidates/${candidate}/profile.md\` (if exists — read this FIRST)
- \`candidates/${candidate}/resume.md\`
- \`interviewers/${interviewer}.md\`
${position && !positionDescription ? `- \`positions/${position}.md\`` : ""}
- \`candidates/${candidate}/sessions/\` (list to see recent sessions)

Read what you need, then generate the voice agent's system prompt. Your final message must be ONLY the prompt text.`;

  const agent = createAgent(systemPrompt);
  const result = await runAgentWithLogging(
    agent,
    [{ role: "user", content: taskMessage }],
    `Generating ${mode} prompt for ${candidate}`,
  );

  return result.trim();
}

// --- Post-session: analyze session, update profile, return summary ---

export async function analyzeSession(params: {
  candidate: string;
  interviewer: string;
  position?: string;
  mode: string;
  sessionFile: string;
}): Promise<SessionSummary> {
  const { candidate, interviewer, position, mode, sessionFile } = params;

  // Convert absolute path to relative path within data/
  const relativeSessionFile = sessionFile.includes("data/")
    ? sessionFile.split("data/")[1]
    : sessionFile;

  const taskMessage = `Analyze the session that just ended and update the candidate's profile.

- **Candidate**: ${candidate}
- **Interviewer**: ${interviewer}
- **Position**: ${position || "(none specified)"}
- **Mode**: ${mode}
- **Session file**: \`${relativeSessionFile}\`

Steps:
1. Read the session transcript at \`${relativeSessionFile}\`
2. Read \`candidates/${candidate}/profile.md\` (if it exists)
3. Analyze performance
4. Write updated \`candidates/${candidate}/profile.md\` using write_file
5. Return ONLY the session summary JSON as your final message`;

  const agent = createAgent(POST_SESSION_SYSTEM_PROMPT);
  const result = await runAgentWithLogging(
    agent,
    [{ role: "user", content: taskMessage }],
    `Analyzing session for ${candidate}`,
  );

  return parseJSON<SessionSummary>(result);
}
