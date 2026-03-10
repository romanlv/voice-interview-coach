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
- No video

---

## Stack

| Layer    | Choice                                     | Reason                                                                  |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Runtime  | Bun / TypeScript                           | Primary stack                                                           |
| STT      | Deepgram Nova-3 (WebSocket streaming)      | Sub-300ms, native VAD, streaming-first                                  |
| LLM      | Claude via `@anthropic-ai/sdk` (streaming) | First-class Bun support, reliable abort for barge-in, minimal footprint |
| TTS      | Deepgram Aura-2                            | Single vendor, low latency, sufficient quality for v1                   |
| Backend  | Bun.serve() with native WebSocket          | Single server, WS proxy to Deepgram                                     |
| Frontend | Vite + plain HTML/JS                       | Separate dev server, hot reload, Deepgram styles                        |
| Storage  | Markdown files on disk                     | Simple, portable, human-readable                                        |

> **Note:** If Aura-2 voice quality proves insufficient after testing, swap TTS to ElevenLabs Flash — isolated to one function call.

---

## Architecture

The system is a monorepo with two packages:

```
/backend   — Bun.serve() server, WS proxy, API endpoints
/frontend  — Vite dev server, plain HTML/JS/CSS
```

Code is organized by feature — each feature contains everything that normally changes together.

### Backend (`backend/src/`)

```
server.ts                       ← Bun.serve setup, routing
features/
  auth/
    jwt.ts                      ← JWT sign/verify (HMAC-SHA256)
    session.ts                  ← /api/session endpoint
  voice/
    handler.ts                  ← WS open/message/close handlers
    state-machine.ts            ← IDLE/LISTENING/THINKING/SPEAKING/INTERRUPTED
    protocol.ts                 ← WS message type definitions
    stt.ts                      ← Deepgram WS connection management
    tts.ts                      ← Deepgram Aura-2 REST, stream reader
  llm/
    client.ts                   ← Anthropic SDK wrapper, streaming, abort
    prompts.ts                  ← System prompt builder (assembles interviewer + position + resume)
    history.ts                  ← Conversation history management
  storage/
    session-writer.ts           ← Session MD file generation (transcript + frontmatter)
    notes.ts                    ← Coaching notes read/merge
    candidates.ts               ← Resume loading, candidate listing
    interviewers.ts             ← Interviewer persona loading, listing
    positions.ts                ← Position description loading, listing
```

### Frontend (`frontend/`)

```
index.html                      ← Shell HTML, layout
main.js                         ← Entry point, wires features together
features/
  audio/
    mic-capture.js              ← getUserMedia, ScriptProcessor, PCM conversion
    tts-player.js               ← AudioContext 24kHz, scheduled playback, stop on interrupt
  connection/
    ws-client.js                ← Connect/disconnect, message routing, auth token
    protocol.js                 ← Message type constants (mirrors backend)
  transcript/
    renderer.js                 ← Transcript items, interim/final, auto-scroll
  agent-ui/
    rating.js                   ← Rating badge display
    coaching-tip.js             ← Tip box display
    state-display.js            ← LISTENING/THINKING/SPEAKING indicator
  config/
    settings.js                 ← Interviewer, position, model, language controls
```

---

## Modes

The interview experience is shaped by two independent selections:

1. **Interviewer persona** (required) — defines tone, question style, and evaluation focus (e.g. recruiter vs technical vs hiring manager)
2. **Mode** — defines the overall session structure

### Current (v1)

Single mode: the AI acts as a conversational interview coach using the selected interviewer persona. It asks questions, listens, gives brief spoken feedback, and moves to the next question. All responses are plain text — no ratings or structured coaching metadata.

### Planned: Interview Mode

The AI acts as a professional interviewer in character. Questions are generated based on the candidate's resume and the selected position (if any). After each answer the AI responds verbally, then rates the answer and gives a coaching tip (shown in the UI, not spoken).

### Planned: Practice Mode

The candidate selects a skill or topic area. The AI runs a focused drill — more forgiving tone, more explicit coaching, encourages retries. Good for targeted preparation before a real interview.

---

## Data Structure

All runtime data lives under `/data`. Content is markdown files — human-readable, portable, and easy to version.

```
/data
  candidates/
    {candidate-slug}/
      resume.md                          ← source of truth for question generation
      notes.md                           ← accumulated coaching insights across sessions
      sessions/
        YYYY-MM-DD-HHmm.md              ← immutable session transcript + frontmatter

  interviewers/
    recruiter.md                         ← persona prompt + behavior guidelines
    technical.md
    manager.md

  positions/                             ← optional, omit to run a general interview
    staff-frontend-engineer.md           ← job description, requirements, focus areas
    backend-tech-lead.md
```

### Interviewers

Each file defines an interviewer persona that shapes how the AI conducts the session — tone, question style, evaluation focus. The filename (without `.md`) is the persona ID used in session config and frontmatter.

Example (`data/interviewers/technical.md`):

```markdown
# Technical Interviewer

You are a senior engineer conducting a technical interview.

## Focus

- System design and architecture decisions
- Code quality, testing, and trade-offs
- Depth of understanding vs surface-level answers

## Style

- Direct and specific follow-up questions
- Ask "why" and "what trade-offs did you consider"
- Neutral tone — neither encouraging nor discouraging
```

### Positions (optional)

Each file describes a target role. When selected, the position context is included in the system prompt so questions and evaluation are tailored to the role's requirements.

Example (`data/positions/staff-frontend-engineer.md`):

```markdown
# Staff Frontend Engineer

## Requirements

- 8+ years frontend experience
- React/TypeScript expertise
- System design for large-scale SPAs
- Cross-team technical leadership

## Focus Areas

- Architecture and scalability
- Performance optimization
- Mentoring and technical decision-making
```

### Sessions

Sessions are immutable transcripts — one file per interview, never modified after creation. Frontmatter captures the session configuration for filtering and aggregation.

```markdown
---
interviewer: technical
position: staff-frontend-engineer # omitted if no position selected
date: 2025-03-05T14:30:00
duration: 23m
score: 7.2
---

# Session Transcript

### Q1 — React Architecture

**Interviewer:** Walk me through how you'd structure a large React app.
**Candidate:** [transcript]
**Rating:** 7/10
**Tip:** Lead with the problem you were solving before describing the solution.

### Q2 — State Management

**Interviewer:** How do you decide between local and global state?
**Candidate:** [transcript]
**Rating:** 8/10
**Tip:** Good trade-off analysis. Could mention performance implications.

---

## Summary

**Overall Score:** 7.2/10
**Strongest Areas:** TypeScript, System Design
**Needs Work:** Behavioural answers, conciseness
**Next Steps:** Practice STAR-format answers for Q3, Q5
```

### Coaching Notes

Per-candidate file that accumulates insights across sessions. Updated by Claude at session end — merges new observations with existing notes rather than appending blindly.

```markdown
# Coaching Notes — Roman

## Strengths

- System design explanations are clear and structured
- Good at relating past experience to the question

## Needs Work

- Behavioral answers lack STAR structure (sessions: 2025-03-05, 2025-03-06)
- Tends to go long — aim for 90 seconds per answer

## Session Log

| Date       | Interviewer | Position       | Score |
| ---------- | ----------- | -------------- | ----- |
| 2025-03-05 | technical   | staff-frontend | 7.2   |
| 2025-03-06 | recruiter   | —              | 6.8   |
```

---

## Core Pipeline

```
Single WebSocket connection: browser ↔ backend (/api/voice)

Browser → Backend (upstream):
  mic audio (16kHz mono linear16 PCM binary frames)

Backend → Browser (downstream), all as JSON or binary:
  1. Deepgram transcript events (interim + final) → browser renders live
  2. On utterance_end → backend triggers Claude
       system prompt: interviewer persona + position (optional) + resume + history
       response: plain text (spoken aloud via TTS)
  3. Claude response text → JSON agent_response message → browser renders in transcript
  4. Claude response text → Deepgram Aura-2 TTS → audio chunks (binary) → browser plays back
```

**Target latency to first audio:** ~1 second from end of user speech.

### TTS Playback

Deepgram Aura-2 REST API (`POST /v1/speak?model=aura-2-en&encoding=linear16`) returns raw PCM audio (24kHz, 16-bit, mono) via chunked transfer encoding.

**Backend:** Waits for Claude's full `spoken_response`, then sends it to Deepgram TTS in one call. Reads the TTS response body as a stream and forwards each chunk as a binary WebSocket message to the browser. Sends `{"type":"tts_end"}` when done. (Future optimization: split response into sentences and pipeline TTS calls for lower TTFB.)

**Frontend:** Uses Web Audio API with scheduled `AudioBufferSourceNode` playback:

1. Maintains a playback `AudioContext` at 24kHz (separate from the 16kHz mic capture context)
2. On binary WS message: convert Int16 PCM → Float32, create `AudioBuffer`, schedule via `source.start(nextPlayTime)`
3. Track `nextPlayTime` for gapless sequential playback
4. On first chunk, set `nextPlayTime = audioContext.currentTime + 0.05` (~50ms buffer)

No container format, no codec — raw PCM is trivially decodable. Expected latency: ~250-450ms to first audio.

### Voice Agent State Machine

```
IDLE → LISTENING → THINKING → SPEAKING → LISTENING → ...
                       ↓          ↓
                  INTERRUPTED → LISTENING
```

| State       | STT    | LLM       | TTS      | Description                              |
| ----------- | ------ | --------- | -------- | ---------------------------------------- |
| IDLE        | off    | off       | off      | Not connected                            |
| LISTENING   | active | off       | off      | Waiting for user speech                  |
| THINKING    | active | streaming | off      | `utterance_end` received, LLM generating |
| SPEAKING    | active | off       | playing  | TTS audio playing back                   |
| INTERRUPTED | active | aborting  | stopping | User barged in, cancelling response      |

**Turn detection:** Use Deepgram's `utterance_end` event (with `endpointing=500` param) as the primary signal that the user finished speaking. More reliable than `speech_final` for interview context where users pause mid-thought.

**Barge-in (interruption):** When STT detects user speech during SPEAKING state:

1. Frontend stops TTS audio playback immediately (disconnect AudioBufferSourceNodes)
2. Frontend sends `{"type":"interrupt"}` over WebSocket
3. Backend aborts in-flight Claude streaming and TTS generation
4. Conversation history is truncated to what was actually spoken before interruption
5. Transition to LISTENING, new user speech becomes the next turn

**Echo cancellation:** Browser AEC (`echoCancellation: true` in getUserMedia) handles echo from TTS playback. STT stays active during SPEAKING state to enable barge-in detection. The separate AudioContexts (16kHz capture vs 24kHz playback) keep the streams independent.

### WebSocket Message Protocol

**Browser → Backend:**
| Type | Format | Description |
|---|---|---|
| Audio | binary (Int16 PCM) | Mic audio frames |
| Interrupt | `{"type":"interrupt"}` | Cancel current TTS/LLM |

**Backend → Browser:**
| Type | Format | Description |
|---|---|---|
| Transcript | JSON string (Deepgram `channel.alternatives`) | Interim + final STT results |
| TTS audio | binary (Int16 PCM, 24kHz) | Audio chunks for playback (only binary messages on the connection) |
| Agent response | `{"type":"agent_response", "text":"..."}` | Claude's plain text response for transcript display |
| TTS end | `{"type":"tts_end"}` | Signals end of audio stream |
| State | `{"type":"state", "state":"LISTENING\|THINKING\|SPEAKING"}` | State transitions for UI sync |

---

## Authentication

- On connect, browser fetches a JWT from `GET /api/session`
- JWT is passed to WebSocket via subprotocol: `access_token.<jwt>`
- Backend verifies JWT synchronously before upgrading the WebSocket connection
- Session secret is per-process (random UUID) or set via `SESSION_SECRET` env var

---

## Claude Prompt Structure

The system prompt is assembled at session start from three sources:

1. **Interviewer persona** (required) — loaded from `data/interviewers/{id}.md`
2. **Position context** (optional) — loaded from `data/positions/{id}.md`
3. **Candidate resume** (required) — loaded from `data/candidates/{slug}/resume.md`

These are composed into a single system prompt by `prompts.ts`:

```
[Interviewer persona content]

[If position selected:]
## Target Position
[Position file content]

## Candidate Resume
[Resume file content]

## Guidelines
- Keep your responses concise (2-4 sentences max) — they will be spoken aloud
- Ask one question at a time, wait for the response
- Respond in plain text only — no JSON, no markdown, no formatting
- Start by greeting the candidate and asking your first question. Keep the greeting brief.
```

Claude returns plain text that is both displayed in the transcript and sent to TTS for spoken playback. No structured JSON parsing is needed.

Conversation history is maintained server-side in memory for the duration of the WebSocket connection. Each turn appends the user's transcript and Claude's response. History is discarded when the connection closes.

> **Future enhancement:** Add structured JSON response format with `rating`, `coaching_tip`, and `skill_area` fields to enable per-answer scoring and coaching UI.

---

## UI

- **Three-column layout:** config sidebar (left), transcript (center), status (right)
- **Config sidebar:** Interviewer selector, position selector (optional), model selector (nova-3/nova-2/nova/enhanced/base), language input
- **Transcript panel:** Real-time transcript with interim (faded) and final results, timestamped
- **Status sidebar:** Connection status (with indicator dot), microphone status, current model/language, message count, final transcript count
- **Connect/Disconnect:** Overlay with connect button, disconnect button appears when connected

No authentication UI. Runs on `localhost:8081` (backend) + `localhost:5173` (Vite frontend).

---

## Server Endpoints (Bun.serve)

| Endpoint        | Method | Description                                                                         |
| --------------- | ------ | ----------------------------------------------------------------------------------- |
| `/api/session`  | GET    | Returns a JWT for WebSocket auth                                                    |
| `/api/metadata` | GET    | Returns app title, description, repo URL                                            |
| `/api/voice`    | WS     | Full voice agent WebSocket: audio in, transcripts + TTS audio + agent responses out |

### Planned Endpoints

| Endpoint            | Method | Description                                     |
| ------------------- | ------ | ----------------------------------------------- |
| `/api/session/end`  | POST   | Triggers summary generation, updates `notes.md` |
| `/api/candidates`   | GET    | Lists candidate folders                         |
| `/api/interviewers` | GET    | Lists available interviewer personas            |
| `/api/positions`    | GET    | Lists available positions (may be empty)        |

> **Design decision:** The full voice pipeline (STT → Claude → TTS) runs over the single `/api/voice` WebSocket. When `utterance_end` fires, the backend triggers Claude and streams TTS audio back over the same connection. No separate endpoint for the LLM/TTS step.

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

The summary is appended to the session file. Insights are merged into `data/candidates/{slug}/notes.md`.

---

## MVP Scope (v1)

- [x] Bun.serve() server with WebSocket proxy to Deepgram
- [x] JWT session auth (sign + sync verify)
- [x] Deepgram WebSocket STT integration (streaming, interim + final results)
- [x] Browser microphone capture (AudioContext, 16kHz linear16 PCM)
- [x] Real-time transcript rendering with interim/final states
- [x] Three-column UI with config, transcript, and status panels
- [x] Claude integration with plain text responses
- [ ] Deepgram Aura-2 TTS — linear16 PCM streamed over WebSocket, Web Audio API playback
- [ ] Voice agent state machine (LISTENING/THINKING/SPEAKING/INTERRUPTED)
- [ ] Barge-in support (interrupt TTS on user speech)
- [ ] Resume loading from candidate folder
- [ ] Interviewer persona loading + selector UI
- [ ] Position loading + selector UI (optional)
- [ ] System prompt assembly (interviewer + position + resume)
- [ ] Session MD writer (transcript + frontmatter)
- [ ] Coaching notes generation + merge
- [ ] Structured response format (rating, coaching tip, skill area)
- [ ] Rating badge + coaching tip display in UI
- [ ] Mode toggle (Interview ↔ Practice)
- [ ] Session summary generation

## Out of Scope (v1)

- Authentication (beyond session JWT)
- Multiple simultaneous candidates
- Video recording
- ElevenLabs TTS (consider if Aura-2 quality insufficient)
- Deepgram Voice Agent API (skipped to retain full orchestration control)

---

## Open Questions

- Resume format: plain `.md` only for now, PDF parsing as follow-up
- Question bank: fully dynamic from Claude each session, or pre-generate a set at session start and follow a plan?
- Frontend consolidation: consider migrating from Vite to Bun's built-in HTML imports for single-server setup
