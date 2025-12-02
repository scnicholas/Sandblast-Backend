// responseModules/advertisingModule.js

function getAdvertisingResponse(userMessage) {
  // Later: connect to real rate cards / forms
  return {
    category: "advertising",
    message:
      "You’re asking about advertising and promotions. Sandblast offers TV, radio, and digital ad options, plus sponsorships.",
    steps: [
      "Tell us what you want to promote and your approximate budget.",
      "We’ll match you with TV, radio, and digital slots that fit.",
      "From there, we can build a simple campaign plan."
    ],
    contact: {
      email: "ads@sandblast.channel",
      note: "You can also use the contact form on the Sandblast site to start a conversation."
    }
  };
}

module.exports = { getAdvertisingResponse };
