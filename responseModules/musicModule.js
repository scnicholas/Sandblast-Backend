// responseModules/musicModule.js

function getMusicResponse(userMessage) {
  // Later: plug into real musicDirectory logic
  const text = userMessage.toLowerCase();

  // Very simple branching for now – just to prove it works
  let message = "I’ve got a few radio and music options for you on Sandblast.";
  if (text.includes("gospel")) {
    message = "Sounds like you’re in a gospel mood. Gospel Sunday runs 6–10 AM on Sandblast Radio.";
  } else if (text.includes("nova")) {
    message = "You’re asking for DJ Nova. Her mixes run on the Sandblast Radio stream in the evenings.";
  } else if (text.includes("live")) {
    message = "To listen live, tune into the main Sandblast Radio stream.";
  }

  return {
    category: "music_radio",
    message,
    // You can add real URLs later:
    links: [
      { label: "Main Sandblast Radio stream", url: "https://www.sandblast.channel/radio/live" },
      { label: "Gospel Sunday", url: "https://www.sandblast.channel/radio/gospel-sunday" }
    ]
  };
}

module.exports = { getMusicResponse };
