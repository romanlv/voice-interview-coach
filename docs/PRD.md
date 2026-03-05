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

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Bun / TypeScript | Primary stack |
| STT | Deepgram Nova-3 (WebSocket streaming) | Sub-300ms, native VAD, streaming-first |
| LLM | Claude via `@anthropic-ai/sdk` (streaming) | First-class Bun support, reliable abort for barge-in, minimal footprint |
| TTS | Deepgram Aura-2 | Single vendor, low latency, sufficient quality for v1 |
| Backend | Bun.serve() with native WebSocket | Single server, WS proxy to Deepgram |
| Frontend | Vite + plain HTML/JS | Separate dev server, hot reload, Deepgram styles |
| Storage | Markdown files on disk | Simple, portable, human-readable |

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
    prompts.ts                  ← System prompt templates (interview/practice)
    history.ts                  ← Conversation history management
  storage/
    session-writer.ts           ← Session MD file generation
    coaching-notes.ts           ← Coaching notes merge
    candidates.ts               ← Resume loading, candidate listing
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
    settings.js                 ← Model, language, mode controls
```

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
Single WebSocket connection: browser ↔ backend (/api/voice)

Browser → Backend (upstream):
  mic audio (16kHz mono linear16 PCM binary frames)

Backend → Browser (downstream), all as JSON or binary:
  1. Deepgram transcript events (interim + final) → browser renders live
  2. On utterance_end → backend triggers Claude (streaming)
       system prompt: resume + history + mode + instructions
       response: { spoken_response, rating, coaching_tip, skill_area }
  3. Claude spoken_response → Deepgram Aura-2 TTS → audio chunks (binary) → browser plays back
  4. Claude rating/tip/skill_area → JSON message → browser renders in UI
  5. Structured result written to session MD file on disk
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

| State | STT | LLM | TTS | Description |
|---|---|---|---|---|
| IDLE | off | off | off | Not connected |
| LISTENING | active | off | off | Waiting for user speech |
| THINKING | active | streaming | off | `utterance_end` received, LLM generating |
| SPEAKING | active | off | playing | TTS audio playing back |
| INTERRUPTED | active | aborting | stopping | User barged in, cancelling response |

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
| Agent response | `{"type":"agent_response", "rating":7, "coaching_tip":"...", "skill_area":"..."}` | UI metadata from Claude |
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

### System Prompt (both modes)

```
You are an AI interview coach. The candidate's resume is below.
Ask one question at a time. After each answer, respond in JSON:

{
  "spoken_response": "...",   // what gets spoken aloud — includes conversational feedback + next question
  "rating": 7,                // 1–10, based on clarity, depth, relevance
  "coaching_tip": "...",      // 1–2 sentences, specific and actionable (shown in UI, not spoken)
  "skill_area": "..."         // e.g. "System Design", "Behavioural"
}

For the opening turn (no candidate answer yet), omit rating/coaching_tip/skill_area
and use spoken_response to introduce yourself and ask the first question.

Only return valid JSON. No markdown, no preamble.

[RESUME]
{resume_content}

[MODE]
{interview | practice}

[HISTORY]
{conversation_history}
```

Conversation history is maintained server-side in memory for the duration of the WebSocket connection. Each turn appends the user's transcript and Claude's response. History is discarded when the connection closes (persisted version lives in the session MD file).

---

## UI

- **Three-column layout:** config sidebar (left), transcript (center), status (right)
- **Config sidebar:** Model selector (nova-3/nova-2/nova/enhanced/base), language input
- **Transcript panel:** Real-time transcript with interim (faded) and final results, timestamped
- **Status sidebar:** Connection status (with indicator dot), microphone status, current model/language, message count, final transcript count
- **Connect/Disconnect:** Overlay with connect button, disconnect button appears when connected

No authentication UI. Runs on `localhost:8081` (backend) + `localhost:5173` (Vite frontend).

---

## Server Endpoints (Bun.serve)

| Endpoint | Method | Description |
|---|---|---|
| `/api/session` | GET | Returns a JWT for WebSocket auth |
| `/api/metadata` | GET | Returns app title, description, repo URL |
| `/api/voice` | WS | Full voice agent WebSocket: audio in, transcripts + TTS audio + agent responses out |

### Planned Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/session/end` | POST | Triggers summary generation, writes `coaching-notes.md` |
| `/api/candidates` | GET | Lists candidate folders |

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

This is written to `session-YYYY-MM-DD.md` and merged into `coaching-notes.md`.

---

## MVP Scope (v1)

- [x] Bun.serve() server with WebSocket proxy to Deepgram
- [x] JWT session auth (sign + sync verify)
- [x] Deepgram WebSocket STT integration (streaming, interim + final results)
- [x] Browser microphone capture (AudioContext, 16kHz linear16 PCM)
- [x] Real-time transcript rendering with interim/final states
- [x] Three-column UI with config, transcript, and status panels
- [ ] Claude streaming integration with dual-mode prompts
- [ ] Deepgram Aura-2 TTS — linear16 PCM streamed over WebSocket, Web Audio API playback
- [ ] Voice agent state machine (LISTENING/THINKING/SPEAKING/INTERRUPTED)
- [ ] Barge-in support (interrupt TTS on user speech)
- [ ] Resume loading from candidate folder
- [ ] Session MD writer
- [ ] Rating badge + coaching tip display in UI
- [ ] Mode toggle (Interview ↔ Practice)
- [ ] Session summary + coaching-notes merge

## Out of Scope (v1)

- Authentication (beyond session JWT)
- Multiple simultaneous candidates
- Video recording
- ElevenLabs TTS (consider if Aura-2 quality insufficient)
- Deepgram Voice Agent API (skipped to retain full orchestration control)

---

## Open Questions

- Resume format: plain `.md` only for now, PDF parsing as follow-up
- Coaching notes merge strategy: append-only vs summarise periodically
- Question bank: fully dynamic from Claude each session, or pre-generate a set at session start and follow a plan?
- Frontend consolidation: consider migrating from Vite to Bun's built-in HTML imports for single-server setup
