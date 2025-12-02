// responseModules/tvModule.js

function getTvResponse(userMessage) {
  // Later: hook this into a TV/serial directory
  const text = userMessage.toLowerCase();

  let message = "You’re asking about Sandblast TV and video content.";
  if (text.includes("western")) {
    message = "You’re looking for westerns. Sandblast TV has classic western series and films in rotation.";
  } else if (text.includes("detective")) {
    message = "You’re looking for detective shows. We’ve got classic crime and detective series in the lineup.";
  } else if (text.includes("movie")) {
    message = "You’re asking about movies. Sandblast TV features a mix of classic serials and films.";
  }

  return {
    category: "tv_video",
    message,
    suggestions: [
      { title: "Classic Serials Block", type: "series" },
      { title: "Retro Movie Nights", type: "movie" }
    ]
  };
}

module.exports = { getTvResponse };
