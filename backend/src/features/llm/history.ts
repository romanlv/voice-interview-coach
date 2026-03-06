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

  clear() {
    this.messages = [];
  }
}
