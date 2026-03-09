export interface PromptConfig {
  interviewer: string;
  resume: string;
  position?: string;
  mode: "practice" | "interview";
}

export function buildSystemPrompt(config: PromptConfig): string {
  const modeGuidelines =
    config.mode === "practice"
      ? `<mode>Practice
- After each answer, provide brief coaching feedback (what was good, what could improve)
- Suggest a better way to phrase or structure the answer when relevant
- Be encouraging but specific with suggestions
</mode>`
      : `<mode>Interview
- Simulate a realistic interview — do NOT give feedback or coaching during the session
- React naturally as an interviewer would (acknowledge, follow up, move on)
- Save all evaluation for the post-interview debrief
</mode>`;

  const positionSection = config.position
    ? `\n<position>\n${config.position}\n</position>\n`
    : "";

  return `<persona>
${config.interviewer}
</persona>
${positionSection}
<resume>
${config.resume}
</resume>

${modeGuidelines}

<guidelines>
- Keep responses concise (2-4 sentences max) — they will be spoken aloud
- Respond in plain text only — no JSON, no markdown, no formatting
- Ask one question at a time
</guidelines>`;
}
