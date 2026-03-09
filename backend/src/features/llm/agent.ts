import { resolve } from "node:path";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { createModel, extractText, parseJSON } from "./model.ts";
import { THINKING_AGENT_SYSTEM_PROMPT } from "./system-prompt.ts";
import type { SessionSummary } from "./types.ts";

const DATA_DIR = resolve(import.meta.dir, "../../../../data");

function createAgent() {
  return createDeepAgent({
    model: createModel(),
    backend: new FilesystemBackend({ rootDir: DATA_DIR, virtualMode: true }),
    systemPrompt: THINKING_AGENT_SYSTEM_PROMPT,
  });
}

// --- Pre-session: generate voice agent prompt ---

export async function generatePrompt(params: {
  candidate: string;
  interviewer: string;
  position?: string;
  mode: "practice" | "interview";
}): Promise<string> {
  const { candidate, interviewer, position, mode } = params;

  const taskMessage = `## Task: pre-session

Generate a system prompt for the voice agent.

- **Candidate**: ${candidate}
- **Interviewer**: ${interviewer}
- **Position**: ${position || "(none specified)"}
- **Mode**: ${mode}

Relevant files to consider:
- \`candidates/${candidate}/profile.md\` (if exists — read this FIRST)
- \`candidates/${candidate}/resume.md\`
- \`interviewers/${interviewer}.md\`
${position ? `- \`positions/${position}.md\`` : ""}
- \`candidates/${candidate}/sessions/\` (list to see recent sessions)

Read what you need, then generate the voice agent's system prompt. Your final message must be ONLY the prompt text.`;

  const agent = createAgent();
  const result = await agent.invoke({
    messages: [{ role: "user", content: taskMessage }],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  return extractText(lastMessage.content).trim();
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

  const taskMessage = `## Task: post-session

Analyze the session that just ended and update the candidate's profile.

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
5. Return ONLY the session summary JSON as your final message

Your final message must be ONLY valid JSON with: score, strengths, needsWork, nextSteps, summary.`;

  const agent = createAgent();
  const result = await agent.invoke({
    messages: [{ role: "user", content: taskMessage }],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  return parseJSON<SessionSummary>(extractText(lastMessage.content));
}
