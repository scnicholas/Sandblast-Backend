// Data/tvDirectory.js

const tvDirectory = [
  {
    id: "retro-westerns-block",
    title: "Retro Westerns Block",
    type: "block",
    platform: "Sandblast TV",
    description: "Classic TV westerns featuring cowboys, outlaws, and frontier justice.",
    page_url: "https://www.sandblast.channel/tv/westerns", // update to real URL
    schedule: {
      daysOfWeek: ["Saturday", "Sunday"],
      startTime: "18:00",
      endTime: "21:00",
      timezone: "America/Toronto"
    },
    genres: ["western", "action"],
    tags: ["cowboys", "frontier", "classic tv"],
    routing_keywords: [
      "westerns",
      "western shows",
      "cowboy shows",
      "retro westerns",
      "tv westerns"
    ],
    priority: 10,
    status: "active"
  },
  {
    id: "retro-detective-block",
    title: "Retro Detective & Crime Block",
    type: "block",
    platform: "Sandblast TV",
    description: "Vintage detective and crime TV series with mystery, suspense, and sharp suits.",
    page_url: "https://www.sandblast.channel/tv/detective", // update to real URL
    schedule: {
      daysOfWeek: ["Friday"],
      startTime: "20:00",
      endTime: "23:00",
      timezone: "America/Toronto"
    },
    genres: ["crime", "mystery"],
    tags: ["detective", "noir", "police"],
    routing_keywords: [
      "detective shows",
      "crime shows",
      "mystery shows",
      "retro detective",
      "police drama"
    ],
    priority: 9,
    status: "active"
  },
  {
    id: "serial-adventures-block",
    title: "Classic Serial Adventures",
    type: "block",
    platform: "Sandblast TV",
    description: "Original movie serials and cliffhanger adventures from the golden age of cinema.",
    page_url: "https://www.sandblast.channel/tv/serials", // update to real URL
    schedule: {
      daysOfWeek: ["Thursday"],
      startTime: "19:00",
      endTime: "22:00",
      timezone: "America/Toronto"
    },
    genres: ["adventure", "serial"],
    tags: ["serials", "cliffhangers", "pulp"],
    routing_keywords: [
      "serials",
      "movie serials",
      "cliffhanger serials",
      "classic serials"
    ],
    priority: 8,
    status: "active"
  },
  {
    id: "retro-movie-night",
    title: "Retro Movie Night",
    type: "block",
    platform: "Sandblast TV",
    description: "Feature-length classic films curated for Sandblast retro movie nights.",
    page_url: "https://www.sandblast.channel/tv/movies", // update to real URL
    schedule: {
      daysOfWeek: ["Saturday"],
      startTime: "21:00",
      endTime: "23:59",
      timezone: "America/Toronto"
    },
    genres: ["movie", "classic"],
    tags: ["feature films", "retro movies"],
    routing_keywords: [
      "movies",
      "retro movies",
      "old movies",
      "movie night",
      "classic films"
    ],
    priority: 9,
    status: "active"
  }
];

module.exports = { tvDirectory };
