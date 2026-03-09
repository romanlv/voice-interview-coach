import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const DATA_DIR = resolve(import.meta.dir, "../../../../data/candidates");

interface SessionData {
  candidate: string;
  interviewer: string;
  position?: string;
  mode: string;
  startTime: number;
  history: { role: string; content: string }[];
}

export async function saveSession(data: SessionData): Promise<string> {
  const dir = resolve(DATA_DIR, data.candidate, "sessions");
  await mkdir(dir, { recursive: true });

  const date = new Date(data.startTime);
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.md`;

  const frontmatter = [
    "---",
    `interviewer: ${data.interviewer}`,
    `candidate: ${data.candidate}`,
    data.position ? `position: ${data.position}` : null,
    `mode: ${data.mode}`,
    `date: ${date.toISOString()}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  // Merge consecutive messages from the same role (voice transcription sends fragments)
  const merged: { role: string; lines: string[] }[] = [];
  for (const m of data.history) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.lines.push(m.content);
    } else {
      merged.push({ role: m.role, lines: [m.content] });
    }
  }

  const transcript = merged
    .map((m) => {
      const label = m.role === "user" ? "Candidate" : "Interviewer";
      return `${label}:\n${m.lines.join("\n")}`;
    })
    .join("\n\n");

  const content = `${frontmatter}\n\n${transcript}\n`;
  const path = resolve(dir, filename);
  await Bun.write(path, content);
  return path;
}
