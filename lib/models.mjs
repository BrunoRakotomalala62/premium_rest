// Auto-generated from GET https://codecraftapi.com/v1/models (2026-10-04)
// CodeCraft API — 33 models. Do not edit by hand unless re-syncing manually.
// vision/tools/web_search reflect each model's capabilities; web_search is a
// per-model flag from CodeCraft (it does NOT enable CodeCraft-side search —
// /api/ai?web=1 implements real search via tool calling, see lib/websearch.mjs).

const MODEL_CATALOG = [
  {
    "id": "muse-spark-1.1",
    "name": "Muse Spark 1.1",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Meta Muse Spark series. Fast and capable with strong reasoning scores."
  },
  {
    "id": "gemma-2-2b",
    "name": "Gemma 2 2B",
    "vision": false,
    "tools": false,
    "web_search": false,
    "context": 8192,
    "description": "Lightweight open model by Google. Fast and efficient for everyday tasks."
  },
  {
    "id": "gpt-5.6-sol",
    "name": "GPT-5.6 Sol",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1050000,
    "description": "OpenAI flagship model. Top-tier reasoning, coding, and agentic capability."
  },
  {
    "id": "claude-opus-5",
    "name": "Claude Opus 5",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic's most capable model. Exceptional reasoning and agentic performance."
  },
  {
    "id": "claude-fable-5",
    "name": "Claude Fable 5",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic premium model. Outstanding coding and reasoning with top Code Arena score."
  },
  {
    "id": "claude-mythos-preview",
    "name": "Claude Mythos Preview",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic next-gen preview model. Cutting-edge reasoning, not yet generally released."
  },
  {
    "id": "kimi-k3",
    "name": "Kimi K3",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1000000,
    "description": "Moonshot AI open-source flagship. Strong reasoning and coding, 2.8T params."
  },
  {
    "id": "glm-5.3",
    "name": "GLM-5.3",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1000000,
    "description": "Zhipu AI latest model. Strong reasoning and agentic capability, 753B params."
  },
  {
    "id": "deepseek-v4-pro-0813",
    "name": "DeepSeek-V4-Pro-0813",
    "vision": false,
    "tools": true,
    "web_search": false,
    "context": 1048576,
    "description": "DeepSeek open-source pro model. Excellent reasoning and coding, 1.6T params."
  },
  {
    "id": "qwen3.8-max",
    "name": "Qwen3.8 Max",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1000000,
    "description": "Alibaba Qwen flagship open model. Strong all-round capability, 2.4T params."
  },
  {
    "id": "gpt-5.6-terra",
    "name": "GPT-5.6 Terra",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1050000,
    "description": "OpenAI high-end model. Strong reasoning and coding at a mid price point."
  },
  {
    "id": "claude-opus-4.8",
    "name": "Claude Opus 4.8",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic Opus-class model. Reliable reasoning and coding performance."
  },
  {
    "id": "gemini-3.7-flash",
    "name": "Gemini 3.7 Flash",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1048576,
    "description": "Google latest Flash model. Very fast with strong reasoning, 479c/s."
  },
  {
    "id": "claude-sonnet-5",
    "name": "Claude Sonnet 5",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic balanced model. Great coding and reasoning at a lower cost."
  },
  {
    "id": "gpt-5.5",
    "name": "GPT-5.5",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1050000,
    "description": "OpenAI capable model. Solid reasoning and coding performance."
  },
  {
    "id": "grok-4.5",
    "name": "Grok 4.5",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 500000,
    "description": "xAI model. Strong reasoning and agentic capability."
  },
  {
    "id": "deepseek-v4-flash-0731",
    "name": "DeepSeek-V4-Flash-0731",
    "vision": false,
    "tools": true,
    "web_search": false,
    "context": 1048576,
    "description": "DeepSeek fast open model. Very affordable with solid reasoning, 304B params."
  },
  {
    "id": "grok-4.6",
    "name": "Grok 4.6",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 500000,
    "description": "xAI latest model. Improved reasoning and coding over 4.5."
  },
  {
    "id": "seed-2.1-pro",
    "name": "Seed 2.1 Pro",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 262144,
    "description": "ByteDance Seed series pro model. Strong reasoning and coding."
  },
  {
    "id": "glm-5.2",
    "name": "GLM-5.2",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1000000,
    "description": "Zhipu AI open model. Good reasoning and coding, 753B params."
  },
  {
    "id": "qwen3.8-27b",
    "name": "Qwen3.8-27B",
    "vision": false,
    "tools": true,
    "web_search": false,
    "context": 262144,
    "description": "Alibaba Qwen compact open model. Efficient 27.8B params with solid capability."
  },
  {
    "id": "gpt-5.6-luna",
    "name": "GPT-5.6 Luna",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1050000,
    "description": "OpenAI efficient model. Great value with strong reasoning, 290c/s speed."
  },
  {
    "id": "qwen3.7-max",
    "name": "Qwen3.7 Max",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1000000,
    "description": "Alibaba Qwen pro model. Strong reasoning and coding performance."
  },
  {
    "id": "claude-opus-4.6",
    "name": "Claude Opus 4.6",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic Opus-class model. Reliable reasoning and agentic performance."
  },
  {
    "id": "gpt-5.5-pro",
    "name": "GPT-5.5 Pro",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1050000,
    "description": "OpenAI pro-tier model. Enhanced reasoning and coding over base 5.5."
  },
  {
    "id": "claude-opus-4.7",
    "name": "Claude Opus 4.7",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic Opus-class model. Strong coding and reasoning, high Code Arena score."
  },
  {
    "id": "gemini-3.6-flash",
    "name": "Gemini 3.6 Flash",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1048576,
    "description": "Google fast model. Very quick responses with good reasoning, 364c/s."
  },
  {
    "id": "kimi-k2.6",
    "name": "Kimi K2.6",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1000000,
    "description": "Moonshot AI open model. Strong reasoning and coding, 1.0T params."
  },
  {
    "id": "seed-2.1-turbo",
    "name": "Seed 2.1 Turbo",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 262144,
    "description": "ByteDance Seed turbo model. Fast with solid reasoning and coding."
  },
  {
    "id": "gemini-3.1-pro",
    "name": "Gemini 3.1 Pro",
    "vision": true,
    "tools": true,
    "web_search": true,
    "context": 1048576,
    "description": "Google pro model. Strong reasoning and coding with high Code Arena score."
  },
  {
    "id": "deepseek-v4-pro-max",
    "name": "DeepSeek-V4-Pro-Max",
    "vision": false,
    "tools": true,
    "web_search": false,
    "context": 1048576,
    "description": "DeepSeek top open model. Maximum capability with 1.6T params."
  },
  {
    "id": "claude-fable-5.1",
    "name": "Claude Fable 5.1",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic premium model. Outstanding coding and reasoning with top Code Arena score."
  },
  {
    "id": "claude-opus-5.5",
    "name": "Claude Opus 5.5",
    "vision": true,
    "tools": true,
    "web_search": false,
    "context": 1000000,
    "description": "Anthropic's most capable model. Exceptional reasoning and agentic performance."
  }
];

// Friendly aliases so callers can use short/spoken names.
const MODEL_ALIASES = {
  "claude-5": "claude-opus-5",
  "claude5": "claude-opus-5",
  "claude": "claude-opus-5",
  "opus-5": "claude-opus-5",
  "opus5": "claude-opus-5",
  "sonnet-5": "claude-sonnet-5",
  "fable": "claude-fable-5",
  "fable-5": "claude-fable-5",
  "fable-5.1": "claude-fable-5.1",
  "mythos": "claude-mythos-preview",
  "mythos-preview": "claude-mythos-preview",
  "gpt-5.6": "gpt-5.6-sol",
  "gpt5.6": "gpt-5.6-sol",
  "luna": "gpt-5.6-luna",
  "terra": "gpt-5.6-terra",
  "sol": "gpt-5.6-sol",
  "gpt-oss": "gpt-5.6-luna",
  "gemini": "gemini-3.7-flash",
  "gemini-flash": "gemini-3.7-flash",
  "grok": "grok-4.6",
  "deepseek": "deepseek-v4-pro-max",
  "qwen": "qwen3.8-max",
  "kimi": "kimi-k3"
};

const DEFAULT_MODEL = "claude-opus-5";
const VISION_DEFAULT_MODEL = "claude-opus-5";

function listModels() { return MODEL_CATALOG.map(m => ({ ...m })); }

function resolveModel(input) {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const byId = MODEL_CATALOG.find(m => m.id.toLowerCase() === lower);
  if (byId) return byId.id;
  if (MODEL_ALIASES[lower]) return MODEL_ALIASES[lower];
  return null;
}

export {  MODEL_CATALOG, MODEL_ALIASES, DEFAULT_MODEL, VISION_DEFAULT_MODEL, listModels, resolveModel  };
