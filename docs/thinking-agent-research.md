# Thinking Agent Research

## Problem

The current `/api/prompt` endpoint assembles a static template: it concatenates interviewer persona + resume + position + mode-specific guidelines. The voice agent receives the same generic prompt regardless of the candidate's history, strengths, or weaknesses.

A **thinking agent** should replace this static assembly with an intelligent prompt generator that:

- **Practice mode**: Reviews past session transcripts and notes, identifies weak areas, generates a prompt that guides the voice agent to focus on those areas
- **Interview mode**: Reads the position requirements and candidate profile, generates a prompt that steers the conversation toward relevant topics and potential gaps

The voice agent's job is to **talk**, not think. The thinking agent does the analysis upfront and produces a tailored system prompt.

## Available Context for the Thinking Agent

```
data/
  candidates/{slug}/
    resume.md              # candidate profile
    notes.md               # accumulated strengths/weaknesses from past sessions
    sessions/
      2026-03-09-1410.md   # timestamped transcripts with YAML frontmatter
  interviewers/
    recruiter.md           # persona: behavioral, STAR method, culture fit
    manager.md             # persona: leadership, strategy, mentorship
    technical.md           # persona: system design, architecture, trade-offs
  positions/
    forward-engineer.md    # job description with requirements
```

The thinking agent reads whichever files are relevant, reasons about what the voice agent should focus on, and outputs a system prompt string.

## Framework Comparison

### 1. Vercel AI SDK (`ai`)

|                 |                                                        |
| --------------- | ------------------------------------------------------ |
| **Package**     | `ai` + `@ai-sdk/anthropic` (or `@ai-sdk/openai`, etc.) |
| **Stars**       | 22.5k                                                  |
| **Maturity**    | Production-proven, backed by Vercel                    |
| **LLM support** | 24 official providers, 30+ community                   |
| **TS quality**  | Excellent, Zod-native tools                            |

**How it works**: Call `generateText()` with tools and `maxSteps`. The SDK runs the tool-use loop automatically.

```typescript
import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const result = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  maxSteps: 5,
  system: "You are a prompt engineer for voice interview agents...",
  prompt: "Generate a practice-mode prompt for candidate roman with interviewer recruiter",
  tools: {
    readFile: tool({
      description: "Read a file from the data directory",
      parameters: z.object({ path: z.string() }),
      execute: async ({ path }) => Bun.file(`data/${path}`).text(),
    }),
    listSessions: tool({
      description: "List session files for a candidate",
      parameters: z.object({ candidate: z.string() }),
      execute: async ({ candidate }) => {
        const glob = new Bun.Glob("*.md");
        const files = [];
        for await (const f of glob.scan(`data/candidates/${candidate}/sessions`)) {
          files.push(f);
        }
        return files;
      },
    }),
  },
});
// result.text contains the generated prompt
```

**Pros**:

- Best multi-LLM abstraction available -- swap `anthropic()` for `openai()` with one line
- Minimal API surface: `generateText()` + `tool()` is all you need
- Mature, well-documented, huge community
- Clean Zod-based tool definitions
- Works perfectly with Bun

**Cons**:

- Large package (includes React hooks, streaming UI helpers you won't use)
- Another abstraction layer over the raw API

---

### 2. LangChain DeepAgents (`deepagents`)

|                 |                                                           |
| --------------- | --------------------------------------------------------- |
| **Package**     | `deepagents` + `@langchain/anthropic` (or other provider) |
| **Stars**       | 759                                                       |
| **Maturity**    | v1.8.1, ~7 months old                                     |
| **LLM support** | Any LangChain provider                                    |
| **TS quality**  | Good, Zod v4                                              |

**How it works**: `createDeepAgent()` with tools and system prompt. Built-in filesystem tools (`read_file`, `ls`, `glob`, `grep`), sub-agent spawning, task planning.

```typescript
import { createDeepAgent } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "langchain";
import { z } from "zod";

const agent = createDeepAgent({
  model: new ChatAnthropic({ model: "claude-sonnet-4-20250514" }),
  systemPrompt: "You are a prompt engineer for voice interview agents...",
  tools: [
    tool(async ({ path }) => await Bun.file(path).text(), {
      name: "read_data_file",
      description: "Read a file from the data directory",
      schema: z.object({ path: z.string() }),
    }),
  ],
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "Generate a practice-mode prompt..." }],
});
```

**Pros**:

- LLM-independent via LangChain providers
- Built-in file tools, sub-agents, planning -- batteries included
- Good learning opportunity for the LangChain ecosystem
- Virtual filesystem abstraction

**Cons**:

- Young library (7 months), docs have gaps (many pages 404)
- Heavy dependency chain: `deepagents` -> `langchain` -> `@langchain/core` -> `@langchain/langgraph`
- 759 stars -- small community, fewer battle-tested production deployments
- Rapid version churn (v1.0 to v1.8 in 7 months) -- API may shift
- Over-powered for this use case (planning, sub-agents, memory not needed)

---

### 3. Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk`)

|                 |                                          |
| --------------- | ---------------------------------------- |
| **Package**     | `@anthropic-ai/claude-agent-sdk`         |
| **Stars**       | 924 (TS), 5.3k (Python)                  |
| **Maturity**    | v0.2.x, pre-1.0                          |
| **LLM support** | Claude only (Anthropic, Bedrock, Vertex) |
| **TS quality**  | Good                                     |

**Architecture warning**: This SDK spawns the **Claude Code CLI as a subprocess**. It doesn't call the API directly -- it orchestrates the full Claude Code binary via JSON-lines over stdio.

**Pros**:

- Full Claude Code power (Read, Write, Edit, Bash, Glob, Grep built-in)
- MCP server support for custom tools
- Hooks for intercepting agent behavior

**Cons**:

- **Claude-only** -- no LLM independence
- **Subprocess overhead** -- spawns entire Claude Code CLI binary
- Pre-1.0, API still evolving
- Way too heavy for generating a prompt string

**Verdict**: Overkill and vendor-locked. Not suitable.

---

### 4. Plain `@anthropic-ai/sdk` (manual tool loop)

|                 |                                 |
| --------------- | ------------------------------- |
| **Package**     | `@anthropic-ai/sdk`             |
| **Maturity**    | Official SDK, always up-to-date |
| **LLM support** | Claude only                     |

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const tools = [
  {
    name: "read_file",
    description: "Read a file",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
];

let messages = [{ role: "user", content: "Generate a prompt for..." }];

while (true) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    tools,
    messages,
  });
  if (response.stop_reason === "end_turn") {
    const text = response.content.find((b) => b.type === "text");
    return text?.text; // the generated prompt
  }
  // Execute tool calls, append results, loop
}
```

**Pros**: Simplest, zero abstraction, smallest dependency
**Cons**: No LLM independence, manual loop code

---

## Decision: LangChain DeepAgents

Chosen for:

- **Built-in filesystem tools** (`read_file`, `ls`, `glob`, `grep`) -- the agent gets file access out of the box
- **LLM independence** via LangChain providers -- swap Anthropic for OpenAI/Google with one line
- **Built by LangChain** -- established team with years of production infrastructure (LangGraph, LangSmith)
- **Learning investment** transfers to the broader LangChain ecosystem
- **Sub-agents and planning** may be useful as the system grows

## Proposed Architecture

```
Browser                    Backend                         LLM (Claude/GPT/etc.)
  |                          |                                    |
  |-- GET /api/prompt ------>|                                    |
  |   ?candidate=roman       |                                    |
  |   &interviewer=recruiter |-- [Thinking Agent] --------------->|
  |   &position=fwd-eng     |   reads: resume, notes, sessions   |
  |   &mode=practice         |   sends: "analyze & generate       |
  |                          |           a voice agent prompt"     |
  |                          |<-- tool calls: readFile, etc. -----|
  |                          |--- file contents ----------------->|
  |                          |<-- generated prompt ---------------|
  |<-- { prompt: "..." } ----|                                    |
  |                          |                                    |
  |== WebSocket to Deepgram Voice Agent with the prompt =========>|
```

The thinking agent:

1. Receives: candidate slug, interviewer slug, position slug, mode
2. Reads relevant files (resume, notes, recent sessions) via tools
3. Reasons about what the voice agent should focus on
4. Outputs a tailored system prompt string
5. The prompt is returned to the browser and passed to Deepgram Voice Agent API

### What Changes

| Current                                            | Proposed                                                     |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `buildSystemPrompt()` concatenates static sections | Thinking agent dynamically generates the prompt              |
| Same prompt every time for same inputs             | Prompt adapts based on session history and notes             |
| No awareness of past performance                   | Practice mode targets weak areas from previous sessions      |
| Instant response                                   | 3-8 second generation time (acceptable during session setup) |

### Install

```bash
bun add deepagents langchain @langchain/core @langchain/langgraph @langchain/anthropic
# For LLM independence later:
# bun add @langchain/openai @langchain/google-genai
```
