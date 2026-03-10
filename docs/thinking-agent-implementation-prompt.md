# Thinking Agent Implementation Prompt

Use this prompt to plan and implement the thinking agent — a self-evolving system that forms memories and adapts across sessions.

---

## Context

I'm building a **voice interview practice app**. The architecture has two AI roles:

1. **Voice agent** (Deepgram Voice Agent API) — talks to the candidate in real-time. Its job is ONLY to talk. It receives a system prompt and follows it.
2. **Thinking agent** (new, to be built) — the brain of the system. It runs at two critical moments:
   - **Pre-session**: Reads the candidate's evolving profile, past sessions, and context → generates a tailored system prompt for the voice agent
   - **Post-session**: Analyzes what just happened → updates the candidate's profile with new observations, patterns, and adjusted focus areas

The thinking agent replaces both the static prompt template AND the current notes generation logic, creating a unified feedback loop where every session makes the next one smarter.

## Tech Stack

- **Runtime**: Bun (not Node.js)
- **Framework**: LangChain DeepAgents (`deepagents` npm package)
- **LLM provider**: `@langchain/anthropic` (Claude Sonnet for speed, swap later via LangChain providers)
- **Backend**: `Bun.serve()` with routes (no Express)
- **Existing code**: TypeScript, all in `backend/src/`

## The Feedback Loop

```
┌─────────────────────────────────────────────────────┐
│                    SESSION CYCLE                     │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │  Profile  │───▶│ Thinking │───▶│ Voice Agent  │  │
│  │ (memory)  │    │  Agent   │    │  (Deepgram)  │  │
│  └──────────┘    │ pre-run  │    └──────┬───────┘  │
│       ▲          └──────────┘           │          │
│       │                            conversation    │
│       │                                 │          │
│  ┌────┴─────┐    ┌──────────┐    ┌─────▼────────┐ │
│  │  Profile  │◀───│ Thinking │◀───│  Transcript  │ │
│  │ (updated) │    │  Agent   │    │   + Summary  │ │
│  └──────────┘    │ post-run │    └──────────────┘  │
│                  └──────────┘                      │
└─────────────────────────────────────────────────────┘
         │                                    ▲
         └────────── next session ────────────┘
```

Each session feeds into the next. The profile accumulates intelligence. The voice agent gets progressively better prompts.

## Data Directory Structure

```
data/
├── candidates/
│   └── {slug}/
│       ├── resume.md              # candidate's resume (static, user-provided)
│       ├── profile.md             # ★ evolving memory — the thinking agent reads AND writes this
│       └── sessions/
│           └── YYYY-MM-DD-HHmm.md  # session transcripts with YAML frontmatter
├── interviewers/
│   ├── recruiter.md
│   ├── manager.md
│   └── technical.md
└── positions/
    └── forward-engineer.md
```

### Session file format (YAML frontmatter + transcript)

```markdown
---
interviewer: recruiter
candidate: roman
position: forward-engineer
mode: interview
date: 2026-03-09T14:10:00.000Z
---

Candidate: Hi, nice to meet you...
Interviewer: Welcome! Tell me about...
```

The transcript uses plain `Candidate:` / `Interviewer:` prefixes with single newlines — no bold markers, no double-spacing. This minimizes token overhead when the thinking agent reads past sessions while staying human-readable.

**Important: XML wrapping at read time.** When the thinking agent loads transcripts into its context, wrap them in XML tags using frontmatter metadata. This gives Claude structural boundary cues (per Anthropic's prompting guidelines) without bloating the stored files:

```xml
<transcript date="2026-03-09" interviewer="recruiter" mode="practice">
Interviewer: Tell me about a time you led a team.
Candidate: At my previous company, I was responsible for...
</transcript>
```

The XML wrapping happens in the agent's prompt assembly, NOT in the stored file. Storage stays clean plain text; the agent gets structural delimiters. Per benchmarks: XML per-turn is 1.8x token cost with worst accuracy, but XML as a wrapper around plain-text content adds ~1% overhead with improved structural comprehension.

### Profile file format (`profile.md`) — replaces `notes.md`

This is the candidate's evolving memory. The thinking agent updates it after every session. It's structured so the agent can quickly parse what matters.

```markdown
# Candidate Profile: Roman

Last updated: 2026-03-09

## Session History

| Date       | Interviewer | Mode      | Position         | Score | Focus                       |
| ---------- | ----------- | --------- | ---------------- | ----- | --------------------------- |
| 2026-03-09 | technical   | interview | forward-engineer | 6/10  | system design, architecture |
| 2026-03-09 | recruiter   | interview | forward-engineer | 4/10  | behavioral, self-intro      |
| 2026-03-06 | technical   | practice  | —                | 5/10  | API design                  |

## Skill Tracker

### Strong Areas

- **System architecture**: Can describe sandbox environments, recovery mechanisms, and service communication clearly when given time (technical session 03-09)
- **Security awareness**: Understands isolation boundaries, subdomain separation, API key management (technical session 03-09)

### Needs Work

- **Behavioral questions**: Deflects or avoids STAR-format answers; hasn't demonstrated a clear conflict resolution or leadership example yet (recruiter sessions)
- **Concise delivery**: Tends to trail off mid-sentence, loses thread of explanation. Needs to practice "headline first, details second" (multiple sessions)
- **Self-introduction**: No prepared elevator pitch. Last recruiter session went off-rails because of this (recruiter 03-09)
- **Handling silence/pacing**: Gets frustrated when conversation flow breaks, instead of using pauses strategically (recruiter 03-09)

### Not Yet Assessed

- Leadership / team management scenarios
- Conflict resolution examples
- Estimation and planning

## Patterns & Observations

- Responds better to technical interviewers who ask concrete questions vs. open-ended behavioral ones
- Gets frustrated when the voice agent interrupts or has latency issues — future prompts should instruct the agent to be extra patient with pauses
- Prefers to explain by walking through architecture rather than giving high-level summaries
- Has not practiced with the manager interviewer yet

## Recommended Next Focus

1. **Priority**: Practice behavioral answers with STAR method — prepare 3-4 stories
2. Run a practice session with recruiter focusing specifically on self-introduction and "tell me about yourself"
3. Try a manager interview to assess leadership/strategy skills
4. Work on concise delivery — practice giving the headline first, then supporting details
```

The profile is a living document. Key design principles:

- **Structured enough to parse**, free-form enough to capture nuance
- **Session history table** gives quick overview without reading every transcript
- **Skill tracker** separates strong/weak/unassessed — the thinking agent uses this to decide focus
- **Patterns** captures meta-observations the voice agent should know about
- **Recommended next focus** is what the pre-session thinking agent reads first to decide priority

## Two Modes

### Practice Mode

The voice agent acts as a coach. The thinking agent's pre-session run should:

- Read `profile.md` — especially "Needs Work" and "Recommended Next Focus"
- Read recent session transcripts to see what topics were already covered
- Identify the weakest area that hasn't been practiced recently
- Generate a prompt that tells the voice agent to focus on that specific weakness
- Include coaching instructions (give feedback after answers, suggest better phrasings)
- Reference specific past mistakes from the profile so the agent can check if the candidate improved

### Interview Mode (mock interview)

The voice agent simulates a realistic interviewer. The thinking agent's pre-session run should:

- Read the position requirements to understand what skills to evaluate
- Read the candidate's resume to find relevant experience and potential gaps
- Read the interviewer persona to adopt the right style
- Read `profile.md` to know what topics were already covered (avoid repeating the exact same questions)
- Read `profile.md` "Not Yet Assessed" to prioritize untested skills
- Generate a prompt that tells the voice agent to conduct a realistic interview covering new ground
- No coaching feedback during the session

## Current Code to Replace/Refactor

### Static prompt builder (to be replaced by pre-session thinking agent)

```typescript
// backend/src/features/llm/prompts.ts
export function buildSystemPrompt(config: PromptConfig): string {
  // ... static template concatenation
  // Keep this file as fallback
}
```

### Session end handler (to be refactored to use post-session thinking agent)

```typescript
// backend/src/server.ts — POST /api/session/end
// Currently:
//   1. generateSessionSummary() via Claude Opus (extended thinking)
//   2. saveSession() — writes transcript
//   3. generateAndMergeNotes() — fire-and-forget LLM call to update notes.md
//
// Will become:
//   1. saveSession() — writes transcript
//   2. Thinking agent post-session run:
//      - Reads the transcript it just saved
//      - Reads current profile.md
//      - Generates session summary (score, strengths, weaknesses, etc.)
//      - Updates profile.md with new observations
//      - Returns the summary to the frontend
```

### Notes generation (to be replaced by profile updates in thinking agent)

```typescript
// backend/src/features/storage/notes.ts
// generateAndMergeNotes() — currently uses a simple prompt to merge notes
// This logic moves INTO the thinking agent's post-session run
// The agent can do a much better job because it has full context:
//   - All past sessions (not just current)
//   - The resume
//   - The position requirements
//   - The existing profile
```

## What to Build

### 1. Install dependencies

```bash
bun add deepagents langchain @langchain/core @langchain/langgraph @langchain/anthropic
```

### 2. Create the thinking agent module

New file: `backend/src/features/thinking-agent/agent.ts`

The agent should:

- Use `createDeepAgent()` from `deepagents`
- Use `ChatAnthropic` with a fast model (Claude Sonnet) — target: 3-8 seconds for pre-session, up to 15 seconds for post-session
- Have filesystem tools (read_file, write_file, ls, glob, grep) scoped to the `data/` directory
- Support two invocation modes:

**Pre-session invocation** (generates voice agent prompt):

- Input: `{ task: "pre-session", candidate, interviewer, position, mode }`
- Reads profile.md, resume, interviewer persona, position, recent sessions as needed
- Returns ONLY the generated system prompt string

**Post-session invocation** (updates profile, returns summary):

- Input: `{ task: "post-session", candidate, interviewer, position, mode, sessionFile }`
- Reads the session transcript, current profile.md, and any other relevant context
- WRITES updated profile.md to disk
- Returns `SessionSummary` JSON (score, strengths, needsWork, nextSteps, summary)

### 3. System prompt for the thinking agent

The thinking agent itself needs a system prompt. It should be the same agent with the same prompt for both pre and post session runs — the task instructions tell it what to do.

The system prompt should instruct it to:

- Understand the overall system: it's the brain behind a voice interview coach
- Know that it has access to `data/` and can read/write files there
- For pre-session tasks:
  - Read the candidate's profile.md FIRST to understand current state
  - Decide what files are relevant based on mode, interviewer, and current weaknesses
  - Generate a voice agent prompt that is tailored, specific, and actionable
  - The generated prompt must respect TTS constraints: short sentences, plain text, one question at a time
  - Never dump raw file contents into the prompt — synthesize and tailor
  - Include specific examples from past sessions ("last time the candidate struggled with X, check if they've improved")
- For post-session tasks:
  - Read the just-saved session transcript
  - Read the current profile.md
  - Analyze what happened: what went well, what didn't, new patterns
  - Update the profile.md with new observations, adjusted skill ratings, updated session history table
  - Merge new insights with existing ones — don't just append, actually revise and evolve the profile
  - Generate the session summary JSON for the frontend
  - Update "Recommended Next Focus" based on everything known so far

### 4. Refactor the `/api/prompt` endpoint

Replace the static `buildSystemPrompt()` call with the thinking agent's pre-session invocation.

```typescript
// backend/src/server.ts — GET /api/prompt
GET: async (req) => {
  const { candidate, interviewer, position, mode } = parseQueryParams(req);

  try {
    const prompt = await thinkingAgent.run({
      task: "pre-session",
      candidate, interviewer, position, mode
    });
    return Response.json({ prompt });
  } catch (err) {
    console.error("Thinking agent failed, using fallback:", err);
    // Fall back to static prompt
    const prompt = buildSystemPrompt({ ... });
    return Response.json({ prompt });
  }
}
```

### 5. Refactor the `/api/session/end` endpoint

Replace the separate summary + notes generation with the thinking agent's post-session invocation.

```typescript
// backend/src/server.ts — POST /api/session/end
POST: async (req) => {
  const { candidate, interviewer, position, mode, history, startTime } = await req.json();

  // 1. Save transcript first (fast, no LLM)
  const sessionFile = await saveSession({
    candidate,
    interviewer,
    position,
    mode,
    startTime,
    history,
  });

  // 2. Run thinking agent post-session (updates profile + returns summary)
  try {
    const summary = await thinkingAgent.run({
      task: "post-session",
      candidate,
      interviewer,
      position,
      mode,
      sessionFile,
    });
    return Response.json(summary);
  } catch (err) {
    console.error("Post-session thinking agent failed:", err);
    // Fallback: use existing summary generation
    const summary = await generateSessionSummary(history);
    return Response.json(summary);
  }
};
```

### 6. Profile Bootstrap

When a candidate has no `profile.md` yet (first session), the thinking agent should:

- **Pre-session**: Work with just the resume and interviewer persona (like the current static prompt, but smarter)
- **Post-session**: Create the initial profile.md from scratch based on what was observed

When a candidate has sessions but no profile (migration from old notes.md system):

- The agent should read all existing sessions and create a profile from them

### 7. Considerations

- **Performance**: Pre-session needs to be fast (3-8 seconds) — it blocks the interview start. Post-session can take longer (up to 15 seconds) since the user sees the summary screen. Use Sonnet for both.
- **Fallback**: If the agent fails at either stage, fall back to existing static logic so the user isn't blocked
- **File scoping**: The agent should only access `data/` — don't expose the rest of the filesystem
- **Profile conflicts**: The agent is the only writer of profile.md, so no concurrency issues
- **Profile size**: Keep profile.md concise. The agent should prune old/irrelevant observations, not just accumulate forever. Target: under 200 lines.
- **Session history in profile**: Only keep the summary table in profile.md. Full transcripts stay in individual session files that the agent can read on demand.
- **Atomic writes**: When updating profile.md, write the complete new version (not append). The agent sees the full context and rewrites the whole profile.
- **Output format**: Pre-session returns ONLY the system prompt string. Post-session returns ONLY valid JSON matching `SessionSummary`.

## File Structure After Implementation

```
backend/src/
├── server.ts                              # routes, calls thinking agent for both endpoints
└── features/
    ├── thinking-agent/
    │   ├── agent.ts                       # createDeepAgent setup, pre/post session runners
    │   └── system-prompt.ts               # system prompt for the thinking agent itself
    ├── llm/
    │   ├── prompts.ts                     # keep as fallback (static template)
    │   └── client.ts                      # keep generateSessionSummary as fallback
    └── storage/
        ├── candidates.ts                  # unchanged
        ├── interviewers.ts                # unchanged
        ├── positions.ts                   # unchanged
        ├── session-writer.ts              # unchanged
        └── notes.ts                       # deprecated, kept for migration fallback

data/candidates/{slug}/
├── resume.md                              # static, user-provided
├── profile.md                             # ★ NEW — evolving memory, written by thinking agent
└── sessions/
    └── YYYY-MM-DD-HHmm.md                # unchanged
```

research: `docs/thinking-agent-research.md`
