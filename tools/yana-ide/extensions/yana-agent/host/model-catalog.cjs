// Curated starting points, not a live-fetched catalog — Yana's own canonical
// provider list (kind/requiresKey/envVar/baseUrl) is authoritative and mirrors
// the Rust side (src/model/catalog.rs::provider_catalog()), but that Rust
// catalog carries no per-model data at all (see its own doc comment — it
// only enumerates providers). The `baseModels` list below is Studio-only:
// several popular models per provider instead of a single guess, each with
// rough metadata (context window, capability tags) so the picker can show
// more than a bare ID. "Dò model" (discoverModels) and the free-text Model ID
// field remain the actual source of truth for what a provider serves today —
// this list exists to give the picker something better than an empty field,
// the same way platforms like OpenRouter/Cursor seed a model list a user can
// still override.
//
// `defaultModel` stays a literal, first-class field (not derived from
// baseModels[0]) and MUST keep its original value per provider: the
// "Studio provider catalog stays aligned with the canonical Rust catalog"
// test in test/core.test.cjs regex-matches every provider's defaultModel
// string against the real Rust provider implementations
// (src/chat/anthropic.rs, gemini.rs, openai_compat.rs) — those files only
// contain the ORIGINAL default IDs, not every extra model added below.
// Live discovery is available for every cloud provider and returns the full
// account-visible list. These entries are only an offline fallback.
function models(...entries) {
  return entries.map(([id, label, context, tags]) => ({
    id,
    label,
    context,
    tags,
  }));
}

const PROVIDERS = Object.freeze([
  {
    "id": "anthropic",
    "label": "Claude",
    "company": "Anthropic",
    "kind": "cloud",
    "category": "cloud",
    "badge": "balanced · tools",
    "modelsSummary": "6 models",
    "requiresKey": true,
    "envVar": "ANTHROPIC_API_KEY",
    "defaultModel": "claude-sonnet-5",
    "baseModels": [
      {
        "id": "claude-opus-5-5",
        "label": "Opus 5.5",
        "context": "1M",
        "tags": [
          "smartest",
          "frontier",
          "coding",
          "reasoning"
        ]
      },
      {
        "id": "claude-sonnet-5-5",
        "label": "Sonnet 5.5",
        "context": "1M",
        "tags": [
          "balanced",
          "fast",
          "tools",
          "coding"
        ]
      },
      {
        "id": "claude-fable-5-1",
        "label": "Fable 5.1",
        "context": "1M",
        "tags": [
          "agents",
          "reasoning",
          "tools"
        ]
      },
      {
        "id": "claude-sonnet-5",
        "label": "Sonnet 5",
        "context": "1M",
        "tags": [
          "balanced",
          "tools",
          "vision"
        ]
      },
      {
        "id": "claude-opus-5",
        "label": "Opus 5",
        "context": "1M",
        "tags": [
          "reasoning",
          "vision"
        ]
      },
      {
        "id": "claude-haiku-4-5-20251001",
        "label": "Haiku 4.5",
        "context": "200K",
        "tags": [
          "fastest",
          "cheap",
          "tools"
        ]
      }
    ]
  },
  {
    "id": "openai",
    "label": "OpenAI",
    "company": "OpenAI",
    "kind": "cloud",
    "category": "cloud",
    "badge": "flagship · reasoning",
    "modelsSummary": "6 models",
    "requiresKey": true,
    "envVar": "OPENAI_API_KEY",
    "defaultModel": "gpt-4o-mini",
    "baseModels": [
      {
        "id": "gpt-6-astra",
        "label": "GPT-6 Astra",
        "context": "1M",
        "tags": [
          "smartest",
          "reasoning",
          "tools",
          "vision"
        ]
      },
      {
        "id": "gpt-6-1-sol",
        "label": "GPT-6.1 Sol",
        "context": "1M",
        "tags": [
          "flagship",
          "coding",
          "tools",
          "fast"
        ]
      },
      {
        "id": "o3",
        "label": "o3",
        "context": "200K",
        "tags": [
          "reasoning",
          "stem"
        ]
      },
      {
        "id": "o3-mini",
        "label": "o3-mini",
        "context": "200K",
        "tags": [
          "reasoning",
          "fast"
        ]
      },
      {
        "id": "gpt-4o",
        "label": "GPT-4o",
        "context": "128K",
        "tags": [
          "balanced",
          "tools",
          "vision"
        ]
      },
      {
        "id": "gpt-4o-mini",
        "label": "GPT-4o mini",
        "context": "128K",
        "tags": [
          "fast",
          "cheap",
          "tools",
          "vision"
        ]
      }
    ]
  },
  {
    "id": "gemini",
    "label": "Gemini",
    "company": "Google",
    "kind": "cloud",
    "category": "cloud",
    "badge": "fast · cheap",
    "modelsSummary": "4 models",
    "requiresKey": true,
    "envVar": "GEMINI_API_KEY",
    "defaultModel": "gemini-3.8-flash",
    "baseModels": [
      {
        "id": "gemini-4-argon",
        "label": "Gemini 4 Argon",
        "context": "1M",
        "tags": [
          "smartest",
          "frontier",
          "coding",
          "reasoning"
        ]
      },
      {
        "id": "gemini-3.8-flash",
        "label": "3.8 Flash",
        "context": "1M",
        "tags": [
          "fast",
          "cheap",
          "tools",
          "vision"
        ]
      },
      {
        "id": "gemini-3.7-flash",
        "label": "3.7 Flash",
        "context": "1M",
        "tags": [
          "fast",
          "tools",
          "vision"
        ]
      },
      {
        "id": "gemini-3.6-flash",
        "label": "3.6 Flash",
        "context": "1M",
        "tags": [
          "cheap",
          "tools",
          "vision"
        ]
      }
    ]
  },
  {
    "id": "groq",
    "label": "Groq",
    "company": "Groq Cloud LPU",
    "kind": "cloud",
    "category": "cloud",
    "badge": "balanced · tools",
    "modelsSummary": "3 models active",
    "requiresKey": true,
    "envVar": "GROQ_API_KEY",
    "defaultModel": "openai/gpt-oss-120b",
    "baseModels": [
      {
        "id": "openai/gpt-oss-120b",
        "label": "GPT-OSS 120B",
        "context": "128K",
        "tags": [
          "balanced",
          "tools"
        ]
      },
      {
        "id": "openai/gpt-oss-20b",
        "label": "GPT-OSS 20B",
        "context": "128K",
        "tags": [
          "fastest",
          "cheap"
        ]
      },
      {
        "id": "qwen/qwen3.6-27b",
        "label": "Qwen 3.6 27B",
        "context": "128K",
        "tags": [
          "tools"
        ]
      }
    ]
  },
  {
    "id": "deepseek",
    "label": "DeepSeek",
    "company": "DeepSeek",
    "kind": "cloud",
    "category": "cloud",
    "badge": "balanced · tools",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "DEEPSEEK_API_KEY",
    "defaultModel": "deepseek-chat",
    "baseModels": [
      {
        "id": "deepseek-chat",
        "label": "DeepSeek Chat",
        "context": "64K",
        "tags": [
          "balanced",
          "tools"
        ]
      },
      {
        "id": "deepseek-reasoner",
        "label": "DeepSeek Reasoner",
        "context": "64K",
        "tags": [
          "reasoning"
        ]
      }
    ]
  },
  {
    "id": "openrouter",
    "label": "OpenRouter",
    "company": "Multi-model Gateway",
    "kind": "cloud",
    "category": "cloud",
    "badge": "cheap",
    "modelsSummary": "120+ models",
    "requiresKey": true,
    "envVar": "OPENROUTER_API_KEY",
    "defaultModel": "google/gemma-3-27b-it",
    "baseModels": [
      {
        "id": "google/gemma-3-27b-it",
        "label": "Gemma 3 27B",
        "context": "8K",
        "tags": [
          "cheap"
        ]
      },
      {
        "id": "anthropic/claude-sonnet-4-6",
        "label": "Claude Sonnet 4.6",
        "context": "200K",
        "tags": [
          "balanced",
          "tools",
          "vision"
        ]
      },
      {
        "id": "meta-llama/llama-3.3-70b-instruct",
        "label": "Llama 3.3 70B",
        "context": "128K",
        "tags": [
          "balanced"
        ]
      }
    ]
  },
  {
    "id": "xai",
    "label": "xAI",
    "company": "xAI (Grok)",
    "kind": "cloud",
    "category": "cloud",
    "badge": "balanced",
    "modelsSummary": "3 models",
    "requiresKey": true,
    "envVar": "XAI_API_KEY",
    "defaultModel": "grok-4.6",
    "baseModels": [
      {
        "id": "grok-4.6",
        "label": "Grok 4.6",
        "context": "500K",
        "tags": [
          "balanced",
          "tools",
          "reasoning"
        ]
      },
      {
        "id": "grok-4.5",
        "label": "Grok 4.5",
        "context": "500K",
        "tags": [
          "balanced",
          "tools"
        ]
      },
      {
        "id": "grok-4.3",
        "label": "Grok 4.3",
        "context": "1M",
        "tags": [
          "long-context",
          "tools",
          "vision"
        ]
      }
    ]
  },
  {
    "id": "mistral",
    "label": "Mistral AI",
    "company": "Mistral Platform",
    "kind": "cloud",
    "category": "cloud",
    "badge": "fast · code",
    "modelsSummary": "4 models",
    "requiresKey": true,
    "envVar": "MISTRAL_API_KEY",
    "defaultModel": "mistral-large-latest",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Mistral AI Model",
        "context": "128K",
        "tags": [
          "fast",
          "code"
        ]
      }
    ]
  },
  {
    "id": "cohere",
    "label": "Cohere",
    "company": "Command R+",
    "kind": "cloud",
    "category": "cloud",
    "badge": "rag · tools",
    "modelsSummary": "3 models",
    "requiresKey": true,
    "envVar": "COHERE_API_KEY",
    "defaultModel": "command-r-plus",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Cohere Model",
        "context": "128K",
        "tags": [
          "rag",
          "tools"
        ]
      }
    ]
  },
  {
    "id": "perplexity",
    "label": "Perplexity",
    "company": "Sonar Online",
    "kind": "cloud",
    "category": "cloud",
    "badge": "search",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "PERPLEXITY_API_KEY",
    "defaultModel": "sonar-pro",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Perplexity Model",
        "context": "128K",
        "tags": [
          "search"
        ]
      }
    ]
  },
  {
    "id": "ai21",
    "label": "AI21 Labs",
    "company": "Jamba 1.5 Mini/Large",
    "kind": "cloud",
    "category": "cloud",
    "badge": "hybrid",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "AI21_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "AI21 Labs Model",
        "context": "128K",
        "tags": [
          "hybrid"
        ]
      }
    ]
  },
  {
    "id": "novita",
    "label": "Novita AI",
    "company": "Novita AI Llama",
    "kind": "cloud",
    "category": "cloud",
    "badge": "balanced",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "NOVITA_API_KEY",
    "defaultModel": "meta-llama/llama-3.1-70b-instruct",
    "baseModels": [
      {
        "id": "meta-llama/llama-3.1-70b-instruct",
        "label": "Llama 3.1 70B",
        "context": "128K",
        "tags": [
          "balanced"
        ]
      },
      {
        "id": "meta-llama/llama-3.1-8b-instruct",
        "label": "Llama 3.1 8B",
        "context": "128K",
        "tags": [
          "cheap",
          "fast"
        ]
      }
    ]
  },
  {
    "id": "nvidia",
    "label": "NVIDIA",
    "company": "NVIDIA NIM",
    "kind": "cloud",
    "category": "cloud",
    "badge": "nvidia/llama-3.1-nemotron-70b",
    "modelsSummary": "1 model",
    "requiresKey": true,
    "envVar": "NVIDIA_API_KEY",
    "defaultModel": "nvidia/llama-3.1-nemotron-70b-instruct",
    "baseModels": [
      {
        "id": "nvidia/llama-3.1-nemotron-70b-instruct",
        "label": "Nemotron 70B",
        "context": "128K",
        "tags": [
          "balanced"
        ]
      }
    ]
  },
  {
    "id": "minimax",
    "label": "MiniMax",
    "company": "MiniMax abab6.5",
    "kind": "cloud",
    "category": "cloud",
    "badge": "balanced",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "MINIMAX_API_KEY",
    "defaultModel": "MiniMax-M2.7",
    "baseModels": [
      {
        "id": "MiniMax-M2.7",
        "label": "M2.7",
        "context": "196K",
        "tags": [
          "balanced",
          "tools"
        ]
      },
      {
        "id": "MiniMax-M2.5",
        "label": "M2.5",
        "context": "196K",
        "tags": [
          "balanced"
        ]
      }
    ]
  },
  {
    "id": "glm",
    "label": "GLM",
    "company": "Zhipu AI GLM-4",
    "kind": "cloud",
    "category": "cloud",
    "badge": "tools",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "GLM_API_KEY",
    "defaultModel": "glm-5.3",
    "baseModels": [
      {
        "id": "glm-5.3",
        "label": "GLM-5.3",
        "context": "128K",
        "tags": [
          "balanced",
          "tools"
        ]
      },
      {
        "id": "glm-5.2",
        "label": "GLM-5.2",
        "context": "128K",
        "tags": [
          "balanced"
        ]
      }
    ]
  },
  {
    "id": "kimi",
    "label": "Kimi",
    "company": "Moonshot AI",
    "kind": "cloud",
    "category": "cloud",
    "badge": "long-context",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "MOONSHOT_API_KEY",
    "defaultModel": "kimi-k3",
    "baseModels": [
      {
        "id": "kimi-k3",
        "label": "Kimi K3",
        "context": "128K",
        "tags": [
          "balanced"
        ]
      },
      {
        "id": "kimi-k3-lite",
        "label": "Kimi K3 Lite",
        "context": "128K",
        "tags": [
          "fast",
          "cheap"
        ]
      }
    ]
  },
  {
    "id": "qwen",
    "label": "Qwen",
    "company": "Alibaba Cloud / DashScope",
    "kind": "cloud",
    "category": "cloud",
    "badge": "coder · vision",
    "modelsSummary": "3 models",
    "requiresKey": true,
    "envVar": "QWEN_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Qwen Model",
        "context": "128K",
        "tags": [
          "coder",
          "vision"
        ]
      }
    ]
  },
  {
    "id": "ernie",
    "label": "Baidu ERNIE",
    "company": "Baidu Qianfan Platform",
    "kind": "cloud",
    "category": "cloud",
    "badge": "enterprise",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "ERNIE_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Baidu ERNIE Model",
        "context": "128K",
        "tags": [
          "enterprise"
        ]
      }
    ]
  },
  {
    "id": "ollama",
    "label": "Ollama",
    "company": "On-device engine",
    "kind": "local",
    "category": "local",
    "badge": "local · 3 models",
    "modelsSummary": "Connected",
    "requiresKey": false,
    "envVar": "",
    "defaultModel": "llama3.2",
    "baseUrl": "http://127.0.0.1:11434",
    "baseModels": [
      {
        "id": "llama3.2",
        "label": "Llama 3.2",
        "context": "128K",
        "tags": [
          "local"
        ]
      },
      {
        "id": "qwen2.5",
        "label": "Qwen 2.5",
        "context": "32K",
        "tags": [
          "local"
        ]
      },
      {
        "id": "deepseek-r1",
        "label": "DeepSeek R1",
        "context": "64K",
        "tags": [
          "local",
          "reasoning"
        ]
      }
    ]
  },
  {
    "id": "turbofieldfare",
    "label": "TurboFieldfare",
    "company": "On-device engine",
    "kind": "local",
    "category": "local",
    "badge": "gemma-4-26b-a4b-it",
    "modelsSummary": "Active",
    "requiresKey": false,
    "envVar": "",
    "defaultModel": "gemma-4-26b-a4b-it",
    "baseUrl": "http://127.0.0.1:8091/v1",
    "baseModels": [
      {
        "id": "gemma-4-26b-a4b-it",
        "label": "Gemma 4 26B",
        "context": "—",
        "tags": [
          "local"
        ]
      }
    ]
  },
  {
    "id": "lmstudio",
    "label": "LM Studio",
    "company": "On-device",
    "kind": "local",
    "category": "local",
    "badge": "local-model",
    "modelsSummary": "Standby",
    "requiresKey": false,
    "envVar": "",
    "defaultModel": "local-model",
    "baseUrl": "http://127.0.0.1:1234/v1",
    "baseModels": [
      {
        "id": "local-model",
        "label": "Loaded in LM Studio",
        "context": "—",
        "tags": [
          "local"
        ]
      }
    ]
  },
  {
    "id": "llamacpp",
    "label": "llama.cpp",
    "company": "On-device",
    "kind": "local",
    "category": "local",
    "badge": "local-model",
    "modelsSummary": "Standby",
    "requiresKey": false,
    "envVar": "",
    "defaultModel": "local-model",
    "baseUrl": "http://127.0.0.1:8080/v1",
    "baseModels": [
      {
        "id": "local-model",
        "label": "Loaded GGUF",
        "context": "—",
        "tags": [
          "local"
        ]
      }
    ]
  },
  {
    "id": "airllm",
    "label": "AirLLM",
    "company": "On-device VRAM optimizer",
    "kind": "local",
    "category": "local",
    "badge": "70B layer streaming",
    "modelsSummary": "Standby",
    "requiresKey": false,
    "envVar": "",
    "defaultModel": "meta-llama/Llama-3.2-3B-Instruct",
    "baseUrl": "http://127.0.0.1:8100/v1",
    "baseModels": [
      {
        "id": "meta-llama/Llama-3.2-3B-Instruct",
        "label": "Đặt qua --model khi chạy bridge",
        "context": "—",
        "tags": [
          "local"
        ]
      }
    ]
  },
  {
    "id": "vllm",
    "label": "vLLM Engine",
    "company": "Local high-throughput",
    "kind": "local",
    "category": "local",
    "badge": "local-server :8000",
    "modelsSummary": "Standby",
    "requiresKey": false,
    "envVar": "VLLM_API_KEY",
    "defaultModel": "default",
    "baseUrl": "http://127.0.0.1:8000/v1",
    "baseModels": [
      {
        "id": "default",
        "label": "vLLM Engine Model",
        "context": "128K",
        "tags": [
          "local-server :8000"
        ]
      }
    ]
  },
  {
    "id": "jan",
    "label": "Jan / Cortex.cpp",
    "company": "Local offline engine",
    "kind": "local",
    "category": "local",
    "badge": "local runtime",
    "modelsSummary": "Standby",
    "requiresKey": false,
    "envVar": "JAN_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Jan / Cortex.cpp Model",
        "context": "128K",
        "tags": [
          "local runtime"
        ]
      }
    ]
  },
  {
    "id": "9router",
    "label": "9Router",
    "company": "Local gateway aggregator",
    "kind": "local",
    "category": "router",
    "badge": "balanced",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "NINE_ROUTER_API_KEY",
    "defaultModel": "kr/claude-sonnet-4.5",
    "baseUrl": "http://127.0.0.1:20128/v1",
    "baseModels": [
      {
        "id": "kr/claude-sonnet-4.5",
        "label": "Claude Sonnet 4.5 (routed)",
        "context": "200K",
        "tags": [
          "balanced"
        ]
      },
      {
        "id": "kr/gpt-4o",
        "label": "GPT-4o (routed)",
        "context": "128K",
        "tags": [
          "balanced"
        ]
      }
    ]
  },
  {
    "id": "huggingface",
    "label": "Hugging Face",
    "company": "Inference Endpoints",
    "kind": "cloud",
    "category": "router",
    "badge": "meta-llama/Llama-3.3-70B",
    "modelsSummary": "1 model",
    "requiresKey": true,
    "envVar": "HUGGINGFACE_API_KEY",
    "defaultModel": "meta-llama/Llama-3.3-70B-Instruct",
    "baseModels": [
      {
        "id": "meta-llama/Llama-3.3-70B-Instruct",
        "label": "Llama 3.3 70B",
        "context": "128K",
        "tags": [
          "balanced"
        ]
      }
    ]
  },
  {
    "id": "together",
    "label": "Together AI",
    "company": "Together Inference",
    "kind": "custom",
    "category": "router",
    "badge": "fast · tools",
    "modelsSummary": "8 models",
    "requiresKey": true,
    "envVar": "TOGETHER_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Together AI Model",
        "context": "128K",
        "tags": [
          "fast",
          "tools"
        ]
      }
    ]
  },
  {
    "id": "fireworks",
    "label": "Fireworks AI",
    "company": "Function Calling & VLM",
    "kind": "custom",
    "category": "router",
    "badge": "fast",
    "modelsSummary": "6 models",
    "requiresKey": true,
    "envVar": "FIREWORKS_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Fireworks AI Model",
        "context": "128K",
        "tags": [
          "fast"
        ]
      }
    ]
  },
  {
    "id": "anyscale",
    "label": "Anyscale",
    "company": "Ray LLM Endpoints",
    "kind": "custom",
    "category": "router",
    "badge": "scale",
    "modelsSummary": "4 models",
    "requiresKey": true,
    "envVar": "ANYSCALE_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Anyscale Model",
        "context": "128K",
        "tags": [
          "scale"
        ]
      }
    ]
  },
  {
    "id": "replicate",
    "label": "Replicate",
    "company": "Serverless Models",
    "kind": "custom",
    "category": "router",
    "badge": "vision",
    "modelsSummary": "5 models",
    "requiresKey": true,
    "envVar": "REPLICATE_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Replicate Model",
        "context": "128K",
        "tags": [
          "vision"
        ]
      }
    ]
  },
  {
    "id": "deepinfra",
    "label": "DeepInfra",
    "company": "Pay-per-token GPU",
    "kind": "custom",
    "category": "router",
    "badge": "cheap",
    "modelsSummary": "6 models",
    "requiresKey": true,
    "envVar": "DEEPINFRA_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "DeepInfra Model",
        "context": "128K",
        "tags": [
          "cheap"
        ]
      }
    ]
  },
  {
    "id": "lepton",
    "label": "Lepton AI",
    "company": "Standard inference API",
    "kind": "custom",
    "category": "router",
    "badge": "fast",
    "modelsSummary": "3 models",
    "requiresKey": true,
    "envVar": "LEPTON_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Lepton AI Model",
        "context": "128K",
        "tags": [
          "fast"
        ]
      }
    ]
  },
  {
    "id": "octoai",
    "label": "OctoAI",
    "company": "Compute Service",
    "kind": "custom",
    "category": "router",
    "badge": "media",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "OCTOAI_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "OctoAI Model",
        "context": "128K",
        "tags": [
          "media"
        ]
      }
    ]
  },
  {
    "id": "hyperbolic",
    "label": "Hyperbolic",
    "company": "Decentralized GPU",
    "kind": "custom",
    "category": "router",
    "badge": "cost-effective",
    "modelsSummary": "4 models",
    "requiresKey": true,
    "envVar": "HYPERBOLIC_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Hyperbolic Model",
        "context": "128K",
        "tags": [
          "cost-effective"
        ]
      }
    ]
  },
  {
    "id": "bedrock",
    "label": "AWS Bedrock",
    "company": "Claude, Llama, Titan",
    "kind": "custom",
    "category": "enterprise",
    "badge": "IAM Role / Key",
    "modelsSummary": "Multi-vendor",
    "requiresKey": true,
    "envVar": "BEDROCK_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "AWS Bedrock Model",
        "context": "128K",
        "tags": [
          "IAM Role / Key"
        ]
      }
    ]
  },
  {
    "id": "azure",
    "label": "Azure OpenAI",
    "company": "Enterprise Deployment",
    "kind": "custom",
    "category": "enterprise",
    "badge": "Azure Endpoint required",
    "modelsSummary": "Dedicated",
    "requiresKey": true,
    "envVar": "AZURE_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Azure OpenAI Model",
        "context": "128K",
        "tags": [
          "Azure Endpoint required"
        ]
      }
    ]
  },
  {
    "id": "cloudflare",
    "label": "Cloudflare AI",
    "company": "Workers AI Edge",
    "kind": "custom",
    "category": "enterprise",
    "badge": "edge · Edge Inference",
    "modelsSummary": "Global Edge",
    "requiresKey": true,
    "envVar": "CLOUDFLARE_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Cloudflare AI Model",
        "context": "128K",
        "tags": [
          "edge",
          "Edge Inference"
        ]
      }
    ]
  },
  {
    "id": "cerebras",
    "label": "Cerebras",
    "company": "Ultra-fast CS-3 LPU",
    "kind": "custom",
    "category": "enterprise",
    "badge": "1800+ tps",
    "modelsSummary": "2 models",
    "requiresKey": true,
    "envVar": "CEREBRAS_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Cerebras Model",
        "context": "128K",
        "tags": [
          "1800+ tps"
        ]
      }
    ]
  },
  {
    "id": "sambanova",
    "label": "SambaNova",
    "company": "DataScale SN40L",
    "kind": "custom",
    "category": "enterprise",
    "badge": "full-precision",
    "modelsSummary": "3 models",
    "requiresKey": true,
    "envVar": "SAMBANOVA_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "SambaNova Model",
        "context": "128K",
        "tags": [
          "full-precision"
        ]
      }
    ]
  },
  {
    "id": "custom",
    "label": "Custom Endpoint",
    "company": "OpenAI-compatible Reverse Proxy",
    "kind": "custom",
    "category": "enterprise",
    "badge": "Custom URL Loopback / HTTPS",
    "modelsSummary": "∞",
    "requiresKey": false,
    "envVar": "CUSTOM_API_KEY",
    "defaultModel": "default",
    "baseUrl": "",
    "baseModels": [
      {
        "id": "default",
        "label": "Custom Endpoint Model",
        "context": "128K",
        "tags": [
          "Custom URL Loopback / HTTPS"
        ]
      }
    ]
  }
]);

function publicCatalog() {
  return PROVIDERS.map((provider) => ({
    ...provider,
    discoverable: provider.kind === "cloud" || provider.discoverable === true,
    canonical: provider.canonical !== false,
    models: (provider.baseModels || []).map((model) => model.id),
    modelCatalog: provider.baseModels || [],
  }));
}

function providerById(id) {
  const provider = PROVIDERS.find((entry) => entry.id === id);
  if (!provider) throw new Error("Unsupported provider: " + id);
  return provider;
}

module.exports = { PROVIDERS, publicCatalog, providerById };
