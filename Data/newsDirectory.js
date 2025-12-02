// Data/newsDirectory.js

const newsDirectory = [
  {
    id: "health-wellness",
    title: "Health & Wellness",
    description: "Articles covering public health, wellness, fitness, and community health updates.",
    categories: ["health", "wellness", "fitness", "public health"],
    routing_keywords: [
      "health",
      "wellness",
      "healthy",
      "medical",
      "fitness",
      "mental health",
      "nutrition"
    ],
    page_url: "https://www.sandblast.channel/news-canada/health",
    priority: 9
  },
  {
    id: "finance-economy",
    title: "Finance & Economy",
    description: "Money, budgeting, banking, savings, economic updates, and small business finance.",
    categories: ["finance", "economy", "savings", "business"],
    routing_keywords: [
      "money",
      "finance",
      "budget",
      "saving",
      "investment",
      "economy",
      "cost of living",
      "business finance"
    ],
    page_url: "https://www.sandblast.channel/news-canada/finance",
    priority: 8
  },
  {
    id: "food-recipes",
    title: "Food, Cooking & Recipes",
    description: "Cooking tips, recipes, food safety, grocery guidance, and kitchen hacks.",
    categories: ["food", "recipes", "cooking"],
    routing_keywords: [
      "food",
      "recipe",
      "cook",
      "kitchen",
      "meal",
      "grocery",
      "nutrition tips"
    ],
    page_url: "https://www.sandblast.channel/news-canada/food",
    priority: 7
  },
  {
    id: "safety-security",
    title: "Safety & Community Awareness",
    description: "Community safety, emergency prep, home protection, and public alerts.",
    categories: ["safety", "security", "community"],
    routing_keywords: [
      "safety",
      "security",
      "crime",
      "community safety",
      "public safety",
      "emergency",
      "danger"
    ],
    page_url: "https://www.sandblast.channel/news-canada/safety",
    priority: 9
  },
  {
    id: "lifestyle-family",
    title: "Lifestyle & Family",
    description: "Family, parenting, travel tips, community life, and everyday lifestyle topics.",
    categories: ["lifestyle", "family", "parenting", "community"],
    routing_keywords: [
      "lifestyle",
      "family",
      "kids",
      "parenting",
      "travel",
      "community living",
      "relationships"
    ],
    page_url: "https://www.sandblast.channel/news-canada/lifestyle",
    priority: 6
  }
];

module.exports = { newsDirectory };
