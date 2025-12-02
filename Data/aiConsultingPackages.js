// Data/aiConsultingPackages.js

const aiConsultingPackages = [
  {
    id: "ai-strategy-starter",
    name: "AI Strategy Starter Session",
    description:
      "A focused strategy session to clarify where AI fits in your business, what to automate, and what to ignore.",
    format: "1:1 call or online session",
    ideal_for: ["solo_founder", "small_business", "early_stage"],
    price_range: {
      currency: "CAD",
      min: 250,
      max: 600
    },
    duration_hours: 2,
    outcomes: [
      "Clear list of 3–5 AI use cases",
      "Plain-language roadmap for next 30–60 days",
      "Recommendations on tools and workflows to start with"
    ],
    routing_keywords: [
      "where do I start",
      "ai strategy",
      "help me get started",
      "what can ai do in my business",
      "roadmap",
      "plan"
    ]
  },
  {
    id: "workflow-and-prompt-lab",
    name: "Workflow & Prompt Engineering Lab",
    description:
      "Hands-on working session to build practical AI workflows and prompts around your real tasks and content.",
    format: "Interactive workshop (remote or hybrid)",
    ideal_for: ["teams", "content_creators", "service_business"],
    price_range: {
      currency: "CAD",
      min: 600,
      max: 1500
    },
    duration_hours: 3,
    outcomes: [
      "Documented prompts and playbooks for daily tasks",
      "Improved speed and quality on 2–3 key workflows",
      "Reusable templates your team can follow"
    ],
    routing_keywords: [
      "prompt engineering",
      "workshop",
      "train my team",
      "prompt help",
      "make my workflows faster",
      "optimize tasks",
      "content workflows"
    ]
  },
  {
    id: "agentic-ai-build",
    name: "Agentic AI & Automation Build",
    description:
      "Design and implementation of a small agentic AI or automation that handles a specific repeatable process.",
    format: "Project-based engagement",
    ideal_for: ["growing_business", "ops_heavy_business"],
    price_range: {
      currency: "CAD",
      min: 1500,
      max: 5000
    },
    duration_hours: 8,
    outcomes: [
      "Defined automation scope and requirements",
      "Prototype or initial version of an AI agent or automation",
      "Documentation on how to run and maintain it"
    ],
    routing_keywords: [
      "agentic",
      "agentic ai",
      "automation",
      "build an ai",
      "custom ai",
      "integrate with my systems",
      "make this process automatic"
    ]
  }
];

module.exports = { aiConsultingPackages };
