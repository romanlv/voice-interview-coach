import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const DIR = resolve(import.meta.dir, "../../../../data/candidates");

export async function listCandidates(): Promise<string[]> {
  const entries = await readdir(DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function loadResume(slug: string): Promise<string> {
  return Bun.file(resolve(DIR, slug, "resume.md")).text();
}
