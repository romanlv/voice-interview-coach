import type { createDeepAgent } from "deepagents";

export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

/**
 * Run agent with streaming to log reasoning and tool calls in real-time.
 * Returns the final message content.
 */
export async function runAgentWithLogging(
  agent: ReturnType<typeof createDeepAgent>,
  messages: Array<{ role: string; content: string }>,
  label: string,
): Promise<string> {
  console.log(cyan(`\n▸ ${label}`));
  const start = Date.now();

  const stream = await agent.stream(
    { messages },
    { streamMode: "updates" },
  );

  let lastContent = "";

  for await (const chunk of stream) {
    // chunk is { [nodeName]: { messages: [...] } }
    for (const [node, update] of Object.entries(chunk)) {
      const msgs = (update as any)?.messages;
      if (!Array.isArray(msgs)) continue;

      for (const msg of msgs) {
        // Tool calls from the agent
        if (msg.tool_calls?.length) {
          for (const tc of msg.tool_calls) {
            const args = tc.args ?? {};
            const name = tc.name as string;

            if (name === "write_todos") {
              const todos = args.todos as any[];
              if (Array.isArray(todos)) {
                console.log(dim(`  ☐ ${yellow("todos")}`));
                for (const t of todos) {
                  const status = t.status === "completed" ? "✓" : "○";
                  console.log(dim(`    ${status} ${t.content ?? t.description ?? JSON.stringify(t)}`));
                }
              }
            } else if (name === "read_file") {
              console.log(dim(`  ↳ ${yellow("read")} ${args.file_path}`));
            } else if (name === "write_file") {
              console.log(dim(`  ↳ ${yellow("write")} ${args.file_path}`));
            } else if (name === "ls") {
              console.log(dim(`  ↳ ${yellow("ls")} ${args.path || "/"}`));
            } else {
              const preview = Object.entries(args)
                .map(([k, v]) => {
                  const s = typeof v === "string" ? v : JSON.stringify(v);
                  return `${k}=${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
                })
                .join(" ");
              console.log(dim(`  ↳ ${yellow(name)} ${preview}`));
            }
          }
        }

        // Tool results — just show errors, skip verbose output
        if (msg.name && msg.content && node === "tools") {
          const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          if (content.startsWith("Error")) {
            console.log(dim(`  ✗ ${msg.name}: ${content.split("\n")[0]}`));
          }
        }

        // AI text response (reasoning / final answer)
        const text = typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
            : "";
        if (text && msg._getType?.() === "ai" || (msg.constructor?.name === "AIMessage" && text)) {
          lastContent = text;
          // Log first 200 chars of reasoning as preview
          const preview = text.length > 200 ? text.slice(0, 200) + "…" : text;
          console.log(dim(`  💭 ${preview}`));
        }
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(cyan(`  ✓ done in ${elapsed}s\n`));

  return lastContent;
}
