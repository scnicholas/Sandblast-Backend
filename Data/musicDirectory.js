// Data/musicDirectory.js

const musicDirectory = [
  {
    id: "gospel-sunday-live",
    title: "Gospel Sunday Live",
    type: "live_show",
    platform: "Sandblast Radio",
    description: "Sunday morning gospel, classics, and inspiration from 6 AM to 10 AM.",
    stream_url: "https://www.sandblast.channel/radio/gospel-sunday", // update to real URL
    schedule: {
      daysOfWeek: ["Sunday"],
      startTime: "06:00",
      endTime: "10:00",
      timezone: "America/Toronto"
    },
    genres: ["gospel", "inspirational"],
    moods: ["uplifting", "morning"],
    routing_keywords: [
      "gospel sunday",
      "sunday morning gospel",
      "gospel show",
      "praise and worship",
      "church music"
    ],
    priority: 10,
    status: "active"
  },
  {
    id: "sandblast-main-radio",
    title: "Sandblast Radio – Live Stream",
    type: "radio_stream",
    platform: "Sandblast Radio",
    description: "24/7 Sandblast Radio stream with music, features, and special segments.",
    stream_url: "https://www.sandblast.channel/radio/live", // update to real URL
    schedule: null,
    genres: ["mixed", "variety"],
    moods: ["anytime", "background"],
    routing_keywords: [
      "sandblast radio",
      "live radio",
      "listen live",
      "play the radio",
      "radio stream"
    ],
    priority: 9,
    status: "active"
  },
  {
    id: "dj-nova-vibes",
    title: "DJ Nova – Vibes Session",
    type: "playlist",
    platform: "DJ Nova",
    description: "Curated mixes hosted by DJ Nova with feel-good, weekend energy.",
    stream_url: "https://www.sandblast.channel/radio/dj-nova", // update to real URL
    schedule: {
      daysOfWeek: ["Friday", "Saturday"],
      startTime: "19:00",
      endTime: "21:00",
      timezone: "America/Toronto"
    },
    genres: ["mixed", "r&b", "pop"],
    moods: ["evening", "weekend", "high-energy"],
    routing_keywords: [
      "dj nova",
      "nova mix",
      "party vibes",
      "weekend mix",
      "dj session"
    ],
    priority: 8,
    status: "active"
  }
];

module.exports = { musicDirectory };
