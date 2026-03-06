import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const DIR = resolve(import.meta.dir, "../../../../data/interviewers");

export async function listInterviewers(): Promise<string[]> {
  const files = await readdir(DIR);
  return files.filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""));
}

export async function loadInterviewer(id: string): Promise<string> {
  return Bun.file(resolve(DIR, `${id}.md`)).text();
}
