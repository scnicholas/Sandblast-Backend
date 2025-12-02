// Data/advertisingOptions.js

const advertisingOptions = [
  {
    id: "starter-radio-digital",
    name: "Starter Radio + Digital Mentions",
    description:
      "Entry-level package for small businesses: radio mentions plus basic digital promotion.",
    channels: ["radio", "digital"],
    ideal_for: ["small_local_business", "testing_campaigns"],
    min_budget_per_month: 200,
    max_budget_per_month: 500,
    campaign_length_weeks: 4,
    goals: ["basic_awareness", "foot_traffic"],
    notes:
      "Good for businesses just starting with Sandblast. Focus on consistent name recognition.",
    routing_keywords: [
      "small budget",
      "starter",
      "test campaign",
      "radio only",
      "radio and digital",
      "200",
      "300",
      "400",
      "500"
    ]
  },
  {
    id: "growth-radio-tv-digital",
    name: "Growth Bundle: Radio + TV Mentions + Digital",
    description:
      "Multi-channel presence across radio, TV mentions, and digital placements for stronger visibility.",
    channels: ["radio", "tv", "digital"],
    ideal_for: ["growing_business", "regional_brand"],
    min_budget_per_month: 500,
    max_budget_per_month: 1500,
    campaign_length_weeks: 8,
    goals: ["brand_visibility", "consistent_presence"],
    notes:
      "Recommended for serious growth efforts. Good for brands that want to be noticed regularly.",
    routing_keywords: [
      "tv and radio",
      "tv and digital",
      "tv radio digital",
      "growth campaign",
      "serious campaign",
      "600",
      "800",
      "1000",
      "1500"
    ]
  },
  {
    id: "premium-tv-featured",
    name: "Premium TV Featured Campaign",
    description:
      "High-impact TV-focused package with prominent placements and feature segments on Sandblast TV.",
    channels: ["tv", "digital"],
    ideal_for: ["established_brand", "launch_campaign"],
    min_budget_per_month: 1500,
    max_budget_per_month: 5000,
    campaign_length_weeks: 8,
    goals: ["brand_authority", "launch_visibility"],
    notes:
      "Best for launches or established brands that want strong screen presence and storytelling.",
    routing_keywords: [
      "tv only",
      "tv focused",
      "big launch",
      "premium",
      "2000",
      "3000",
      "4000",
      "5000"
    ]
  }
];

module.exports = { advertisingOptions };
