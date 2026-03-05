# PRD: AI Interview Coach

## Overview

A local voice-based AI tool that interviews candidates based on their resume, rates their answers, provides real-time coaching, and runs practice sessions. All conversations and results are stored as markdown files on disk.

---

## Goals

- Simulate realistic job interviews using the candidate's resume as context
- Give actionable, per-answer coaching without waiting until the end
- Let candidates do focused practice runs on weak areas
- Produce structured session summaries for self-review

---

## Non-Goals (v1)

- No multi-user / multi-tenant support
- No web hosting or deployment
- No phone integration
- No UI beyond a minimal local browser interface
- No video

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Bun / TypeScript | Primary stack |
| STT | Deepgram Nova-3 (WebSocket streaming) | Sub-300ms, native VAD, streaming-first |
| LLM | Claude (Anthropic API, streaming) | Structured output control, best reasoning |
| TTS | Deepgram Aura-2 | Single vendor, low latency, sufficient quality for v1 |
| UI | Bun.serve() + browser (single HTML file) | Browser handles mic via MediaRecorder / VAD |
| Storage | Markdown files on disk | Simple, portable, human-readable |

> **Note:** If Aura-2 voice quality proves insufficient after testing, swap TTS to ElevenLabs Flash — isolated to one function call.

---

## Modes

### Interview Mode
The AI acts as a professional interviewer. Questions are generated based on the candidate's resume. After each answer the AI responds verbally, then rates the answer and gives a coaching tip (shown in the UI, not spoken).

### Practice Mode
The candidate selects a skill or topic area. The AI runs a focused drill — more forgiving tone, more explicit coaching, encourages retries. Good for targeted preparation before a real interview.

---

## File Structure

```
/candidates
  /{candidate-slug}/
    resume.md                    ← source of truth for question generation
    session-YYYY-MM-DD-HH-mm.md  ← full transcript + per-answer ratings
    coaching-notes.md            ← accumulated weak areas across sessions
```

### Session File Format

```markdown
# Session: 2025-03-05 14:30
## Mode: Interview

### Q1 — React Architecture
**Question:** Walk me through how you'd structure a large React app.
**Answer:** [transcript]
**Rating:** 7/10
**Tip:** Lead with the problem you were solving before describing the solution.

---

## Summary
**Overall Score:** 7.2/10
**Strongest Areas:** TypeScript, System Design
**Needs Work:** Behavioural answers, conciseness
**Next Steps:** Practice STAR-format answers for Q3, Q5
```

---

## Core Pipeline

```
Browser (VAD detects end of speech)
  → audio blob POST /respond
      → Deepgram WebSocket → transcript
      → Claude API (streaming)
          system prompt: resume + history + mode + instructions
          response: { speak_text, rating, coaching_tip, skill_area }
      → Deepgram Aura-2 TTS → audio stream → browser plays back
      → write structured result to session MD file
```

**Target latency to first audio:** ~1 second from end of user speech.

---

## Claude Prompt Structure

### System Prompt (both modes)

```
You are an AI interview coach. The candidate's resume is below.
Ask one question at a time. After each answer, respond in JSON:

{
  "speak_text": "...",        // what gets spoken aloud — conversational, concise
  "next_question": "...",     // the next question to ask (spoken after tip is shown)
  "rating": 7,                // 1–10, based on clarity, depth, relevance
  "coaching_tip": "...",      // 1–2 sentences, specific and actionable
  "skill_area": "..."         // e.g. "System Design", "Behavioural"
}

Only return valid JSON. No markdown, no preamble.

[RESUME]
{resume_content}

[MODE]
{interview | practice}

[HISTORY]
{conversation_history}
```

---

## UI (v1 — Single HTML Page)

- **Status indicator:** Idle / Listening / Thinking / Speaking
- **Transcript panel:** Live transcript as candidate speaks
- **Rating badge:** Shows 1–10 after each answer
- **Coaching tip box:** Shown after each answer, stays until next question
- **Mode toggle:** Interview ↔ Practice
- **Session summary button:** Triggers end-of-session summary generation

No authentication. Runs on `localhost:3000`.

---

## Server Endpoints (Bun.serve)

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Serves the UI |
| `/respond` | POST | Receives audio blob, runs full pipeline, streams audio back |
| `/session/end` | POST | Triggers summary generation, writes `coaching-notes.md` |
| `/candidates` | GET | Lists candidate folders |

---

## Session Summary Generation

On session end, Claude receives the full session transcript and outputs:

```json
{
  "overall_score": 7.2,
  "strongest_areas": ["TypeScript", "System Design"],
  "needs_work": ["Behavioural answers", "Conciseness"],
  "next_steps": ["Practice STAR format", "Limit answers to 90 seconds"]
}
```

This is written to `session-YYYY-MM-DD.md` and merged into `coaching-notes.md`.

---

## MVP Scope (v1)

- [ ] Bun.serve() server with `/respond` and `/session/end` endpoints
- [ ] Deepgram WebSocket STT integration
- [ ] Claude streaming integration with dual-mode prompts
- [ ] Deepgram Aura-2 TTS — chunked audio stream back to browser
- [ ] Browser VAD (end-of-speech detection)
- [ ] Resume loading from candidate folder
- [ ] Session MD writer
- [ ] Minimal UI (status, transcript, rating, tip, mode toggle)
- [ ] Session summary + coaching-notes merge

## Out of Scope (v1)

- [ ] Authentication
- [ ] Multiple simultaneous candidates
- [ ] Video recording
- [ ] ElevenLabs TTS (consider if Aura-2 quality insufficient)
- [ ] Deepgram Voice Agent API (skipped to retain full orchestration control)

---

## Open Questions

- VAD library: `@ricky0123/vad-web` in browser vs Deepgram's built-in VAD — test both, pick lower friction
- Resume format: plain `.md` only for now, PDF parsing as follow-up
- Coaching notes merge strategy: append-only vs summarise periodically
- Question bank: fully dynamic from Claude each session, or pre-generate a set at session start and follow a plan?
