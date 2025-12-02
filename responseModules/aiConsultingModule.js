// responseModules/aiConsultingModule.js

function getAiConsultingResponse(userMessage) {
  // Later: hook into Sandblast AI Consulting offers
  return {
    category: "ai_consulting",
    message:
      "You’re asking about AI consulting and support. Sandblast AI Consulting helps businesses use AI in a practical, no-nonsense way.",
    services: [
      "AI strategy sessions (what to build, what NOT to build)",
      "Prompt engineering and workflow design",
      "Agentic AI and automation setups",
      "Training and workshops for teams"
    ],
    nextStep:
      "Share your industry, your main bottleneck, and what you’d like AI to help you with. From there, we can suggest a clear starting package."
  };
}

module.exports = { getAiConsultingResponse };
