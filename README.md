# AI Voice Interview Coach

A voice-based AI interview coach that conducts realistic mock interviews using your resume, gives real-time feedback, and helps you practice for the real thing. Talk to it like a real interviewer — it listens, responds, and coaches you on the spot.

## How It Works

- Pick an **interviewer persona** (recruiter, technical, hiring manager) and optionally a **target position**
- The AI reads your resume and conducts a live voice interview over WebSocket
- Speech-to-text (Deepgram Nova-3) transcribes you in real time
- Claude generates interviewer responses, streamed as text and spoken back via TTS (Deepgram Aura-2)
- Session transcripts and coaching notes are saved as markdown files

## Data Setup

Everything runs off markdown files in `data/`. Set this up first — without a resume, there's nothing to interview you on.

```
data/
  candidates/{your-name}/
    resume.md              ← your resume (required)
  interviewers/
    recruiter.md           ← included: warm, behavioral focus
    technical.md           ← included: system design, engineering depth
    manager.md             ← included: leadership, team fit
  positions/
    your-target-role.md    ← job description (optional, tailors questions)
```

**To get started:** create a folder under `data/candidates/` with your name and add a `resume.md` with your experience, skills, and background. Plain markdown, no special format required.

Interviewer personas are included. Positions are optional — add a markdown file with the job description and requirements to get role-specific questions.

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- A **Deepgram** API key with **Member** role (not just API-only — Member role is required for streaming STT)
  - New accounts get **$200 in free credits** at [deepgram.com](https://deepgram.com)
- An **Anthropic** API key — or a **Claude Pro/Max subscription** (use your auth token from claude.ai)

## Setup

```bash
git clone <repo-url>
cd voice-interview

# Install dependencies
cd backend && bun install && cd ..
cd frontend && bun install && cd ..

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys:
#   DEEPGRAM_API_KEY=your-key-here
#   ANTHROPIC_AUTH_TOKEN=your-key-here
```

## Running

```bash
# Terminal 1 — backend (port 8081)
cd backend && bun run dev

# Terminal 2 — frontend (port 5173)
cd frontend && bun run dev
```

Open [https://localhost:5173](https://localhost:5173) in your browser. Grant microphone access, pick your interviewer and position, and hit Connect.

## Stack

| Layer    | Tech                                  |
| -------- | ------------------------------------- |
| Runtime  | Bun + TypeScript                      |
| STT      | Deepgram Nova-3 (WebSocket streaming) |
| LLM      | Claude via Anthropic SDK              |
| TTS      | Deepgram Aura-2                       |
| Frontend | Vite + React + Tailwind               |
| Storage  | Markdown files on disk                |

## License

MIT
