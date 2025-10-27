import { DRUNK_TESTER_PROMPT } from "./constants.js";

class MessageHistory {
  constructor() {
    if (MessageHistory.instance) {
      return MessageHistory.instance;
    }

    this.reset();
    MessageHistory.instance = this;
  }

  getMessages() {
    return this.messages;
  }

  addUser(content) {
    this.messages.push({ role: "user", content });
  }

  addAssistant(content) {
    this.messages.push({ role: "assistant", content });
  }

  addSystem(content) {
    this.messages.push({ role: "system", content });
  }
  
  addError(errorMessage) {
    this.messages.push({
      role: "user",
      content: `The last attempt failed with error: ${errorMessage}. Try a different approach.`
    });
  }

  reset() {
    this.messages = [
      { role: "system", content: DRUNK_TESTER_PROMPT }
    ];
  }
}

const instance = new MessageHistory();
export default instance;