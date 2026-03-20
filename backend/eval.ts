import { createModel, getSystemPromptPrefix } from "./src/features/llm/model.ts";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const model = createModel();
const prefix = getSystemPromptPrefix();

console.log("Model created. OAuth:", !!process.env.ANTHROPIC_AUTH_TOKEN);
console.log("Prefix:", prefix ? JSON.stringify(prefix.slice(0, 60) + "...") : "(none)");

const res = await model.invoke([
  new SystemMessage(prefix + "You are a helpful assistant."),
  new HumanMessage("Say hi in 5 words"),
]);

console.log("Response:", res.content);
