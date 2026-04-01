import { resolve } from "node:path";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { createModel, getSystemPromptPrefix, parseJSON } from "./model.ts";
import { runAgentWithLogging } from "./logging.ts";
import {
  PRACTICE_SYSTEM_PROMPT,
  INTERVIEW_SYSTEM_PROMPT,
  POST_SESSION_SYSTEM_PROMPT,
} from "./system-prompt.ts";
import type { SessionSummary } from "./types.ts";

const DATA_DIR = resolve(import.meta.dir, "../../../../data");

function createAgent(systemPrompt: string) {
  return createDeepAgent({
    model: createModel(),
    backend: new FilesystemBackend({ rootDir: DATA_DIR, virtualMode: true }),
    systemPrompt: getSystemPromptPrefix() + systemPrompt,
  });
}

// --- Pre-session: generate voice agent prompt ---

export async function generatePrompt(params: {
  candidate: string;
  interviewer: string;
  position?: string;
  positionDescription?: string;
  mode: "practice" | "interview";
  durationMinutes?: number;
}): Promise<string> {
  const { candidate, interviewer, position, positionDescription, mode, durationMinutes } = params;

  const systemPrompt = mode === "practice" ? PRACTICE_SYSTEM_PROMPT : INTERVIEW_SYSTEM_PROMPT;

  const positionSection = positionDescription
    ? `- **Position description** (provided inline):\n<position-description>\n${positionDescription}\n</position-description>`
    : `- **Position**: ${position || "(none specified)"}`;

  const durationSection = durationMinutes
    ? `- **Session duration**: ${durationMinutes} minutes — pace questions accordingly (aim for roughly one question per 4-5 minutes)`
    : `- **Session duration**: No fixed limit`;

  const taskMessage = `Generate a system prompt for the voice agent.

- **Candidate**: ${candidate}
- **Interviewer**: ${interviewer}
${positionSection}
${durationSection}

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
