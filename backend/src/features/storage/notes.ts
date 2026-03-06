import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const DATA_DIR = resolve(import.meta.dir, "../../../../data/candidates");

const anthropic = new Anthropic();

export async function loadNotes(slug: string): Promise<string | null> {
  const file = Bun.file(resolve(DATA_DIR, slug, "notes.md"));
  if (await file.exists()) return file.text();
  return null;
}

export async function saveNotes(slug: string, content: string): Promise<void> {
  await Bun.write(resolve(DATA_DIR, slug, "notes.md"), content);
}

export async function generateAndMergeNotes(
  candidate: string,
  history: { role: string; content: string }[],
  existingNotes: string | null,
): Promise<string> {
  const transcript = history
    .map((m) => `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content}`)
    .join("\n");

  const prompt = existingNotes
    ? `Here are existing coaching notes for this candidate:\n\n${existingNotes}\n\nHere is a new interview transcript:\n\n${transcript}\n\nUpdate the coaching notes to incorporate insights from this new session. Merge new observations with existing ones, noting patterns and progress. Keep the notes concise and actionable.`
    : `Here is an interview transcript:\n\n${transcript}\n\nCreate coaching notes for this candidate. Include: key strengths observed, areas needing improvement, specific examples from the interview, and actionable next steps. Keep notes concise and actionable.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0];
  if (!text || text.type !== "text") throw new Error("Unexpected response");

  const notes = text.text;
  await saveNotes(candidate, notes);
  return notes;
}
