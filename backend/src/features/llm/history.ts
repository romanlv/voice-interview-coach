type Message = {
  role: "user" | "assistant";
  content: string;
};

export class ConversationHistory {
  private messages: Message[] = [];

  addUserTurn(text: string) {
    this.messages.push({ role: "user", content: text });
  }

  addAssistantTurn(text: string) {
    this.messages.push({ role: "assistant", content: text });
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  replaceLastAssistant(text: string) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]!;
      if (msg.role === "assistant") {
        msg.content = text;
        return;
      }
    }
  }

  clear() {
    this.messages = [];
  }
}
