const axios = require("axios");

async function fetchHomePage() {
  const url = "https://www.newscanada.com/home";

  const response = await axios.get(url, {
    headers: {
      "User-Agent": "SandblastNewsBot/1.0",
      Accept: "text/html,application/xhtml+xml"
    },
    timeout: 20000
  });

  return {
    url,
    html: response.data
  };
}

module.exports = { fetchHomePage };
