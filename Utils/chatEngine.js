// Chat Engine vFinal - Syntax Checked
// Core pipeline: input -> normalize -> state -> emotion -> response -> output

class ChatEngine {
  constructor() {
    this.state = {
      lastUserInput: "",
      lastIntent: null,
      emotionalState: "neutral",
      memory: []
    };
  }

  processInput(input) {
    try {
      const normalized = this.normalize(input);
      const intent = this.detectIntent(normalized);
      const emotion = this.detectEmotion(normalized);

      this.updateState(normalized, intent, emotion);

      const response = this.generateResponse(normalized, intent, emotion);

      this.logPipeline(normalized, intent, emotion, response);

      return response;
    } catch (err) {
      console.error("ChatEngine Error:", err);
      return "Something went wrong. Let's try that again.";
    }
  }

  normalize(input) {
    if (!input || typeof input !== "string") return "";
    return input.trim().toLowerCase();
  }

  detectIntent(input) {
    if (input.includes("hi") || input.includes("hello")) return "greeting";
    if (input.includes("help")) return "help";
    if (input.includes("music")) return "music";
    return "general";
  }

  detectEmotion(input) {
    if (input.includes("sad") || input.includes("depressed")) return "low";
    if (input.includes("happy") || input.includes("great")) return "high";
    return "neutral";
  }

  updateState(input, intent, emotion) {
    this.state.lastUserInput = input;
    this.state.lastIntent = intent;
    this.state.emotionalState = emotion;

    this.state.memory.push({
      input,
      intent,
      emotion,
      timestamp: Date.now()
    });

    if (this.state.memory.length > 10) {
      this.state.memory.shift();
    }
  }

  generateResponse(input, intent, emotion) {
    let response = "";

    // Emotional layer first
    if (emotion === "low") {
      response += "I hear you. Let's take this one step at a time. ";
    } else if (emotion === "high") {
      response += "I like that energy. ";
    }

    // Intent handling
    switch (intent) {
      case "greeting":
        response += this.dynamicGreeting();
        break;
      case "help":
        response += "Tell me what you need, and I’ll guide you through it.";
        break;
      case "music":
        response += "Let’s find something that fits your mood perfectly.";
        break;
      default:
        response += this.contextualResponse(input);
    }

    return response;
  }

  dynamicGreeting() {
    const greetings = [
      "Good to see you. What are we exploring today?",
      "Hey. Let’s make something interesting happen.",
      "Hi. Where do you want to go with this?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  contextualResponse(input) {
    if (this.state.lastIntent === "general") {
      return "Expand on that a bit. I want to understand exactly where you're going.";
    }
    return "I'm following. Keep going.";
  }

  logPipeline(input, intent, emotion, response) {
    console.log("PIPELINE TRACE:", {
      input,
      intent,
      emotion,
      response
    });
  }
}

// Export for usage
if (typeof module !== "undefined") {
  module.exports = ChatEngine;
}
