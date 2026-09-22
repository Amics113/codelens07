import type { ProviderKind, ProviderService } from "./types";

export interface ProviderPreset {
  id: ProviderService;
  label: string;
  kind: ProviderKind;
  endpoint: string;
  description: string;
  requiresApiKey: boolean;
  supportsModelDiscovery: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "ollama",
    label: "Ollama",
    kind: "local",
    endpoint: "http://localhost:11434/v1",
    description: "Local models running through Ollama.",
    requiresApiKey: false,
    supportsModelDiscovery: true
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "local",
    endpoint: "http://localhost:1234/v1",
    description: "Local models served by LM Studio.",
    requiresApiKey: false,
    supportsModelDiscovery: true
  },
  {
    id: "localai",
    label: "LocalAI",
    kind: "local",
    endpoint: "http://localhost:8080/v1",
    description: "Local OpenAI-compatible inference server.",
    requiresApiKey: false,
    supportsModelDiscovery: true
  },
  {
    id: "custom_local",
    label: "Other Local (OpenAI-compatible)",
    kind: "local",
    endpoint: "",
    description: "A self-hosted local OpenAI-compatible server.",
    requiresApiKey: false,
    supportsModelDiscovery: true
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "cloud",
    endpoint: "https://api.openai.com/v1",
    description: "OpenAI API.",
    requiresApiKey: true,
    supportsModelDiscovery: true
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "cloud",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    description: "Gemini through Google's OpenAI-compatible API.",
    requiresApiKey: true,
    supportsModelDiscovery: true
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "cloud",
    endpoint: "https://openrouter.ai/api/v1",
    description: "Multi-provider OpenAI-compatible gateway.",
    requiresApiKey: true,
    supportsModelDiscovery: true
  },
  {
    id: "groq",
    label: "Groq",
    kind: "cloud",
    endpoint: "https://api.groq.com/openai/v1",
    description: "Groq OpenAI-compatible API.",
    requiresApiKey: true,
    supportsModelDiscovery: true
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "cloud",
    endpoint: "https://api.deepseek.com/v1",
    description: "DeepSeek OpenAI-compatible API.",
    requiresApiKey: true,
    supportsModelDiscovery: true
  },
  {
    id: "custom",
    label: "Other OpenAI-compatible",
    kind: "cloud",
    endpoint: "",
    description: "Enter a compatible base URL manually.",
    requiresApiKey: true,
    supportsModelDiscovery: true
  }
];

export function presetFor(service?: ProviderService): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id === service);
}

export function inferService(kind: ProviderKind, endpoint: string): ProviderService {
  const e = endpoint.trim().replace(/\/+$/, "").toLowerCase();
  if (kind === "local") {
    if (e.includes(":11434")) return "ollama";
    if (e.includes(":1234")) return "lmstudio";
    if (e.includes(":8080")) return "localai";
    return "custom";
  }
  if (e.includes("generativelanguage.googleapis.com")) return "gemini";
  if (e.includes("api.openai.com")) return "openai";
  if (e.includes("openrouter.ai")) return "openrouter";
  if (e.includes("api.groq.com")) return "groq";
  if (e.includes("api.deepseek.com")) return "deepseek";
  return "custom";
}
