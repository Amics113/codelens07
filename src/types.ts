export type RoutingMode = "fixed" | "ask" | "automatic";
export type PrivacyMode = "local_only" | "balanced" | "cloud_allowed" | "ask_before_cloud";
export type ProviderKind = "local" | "cloud";
export type ProviderService = "ollama" | "lmstudio" | "localai" | "openai" | "gemini" | "openrouter" | "groq" | "deepseek" | "custom" | "custom_local";

export interface AIProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  /** Known service used to select the correct endpoint automatically. */
  service?: ProviderService;
  endpoint: string;
  model: string;
  models: string[];
  enabled: boolean;
  connected: boolean;
  capabilities: string[];
  credentialConfigured?: boolean;
}

export interface RoutingConfig {
  errorAnalysis: RoutingMode;
  explanation: RoutingMode;
  betterSolution: RoutingMode;
  debugging: RoutingMode;
  security: RoutingMode;
  performance: RoutingMode;
  testing: RoutingMode;
  architecture: RoutingMode;
  fixedProviderId?: string;
}

export interface AppConfig {
  enabled: boolean;
  focusMode: boolean;
  networkLock: boolean;
  telemetry: boolean;
  privacyMode: PrivacyMode;
  contextLevel: "minimal" | "balanced" | "deep";
  sensitivity: "minimal" | "balanced" | "proactive";
  automaticAnalysis: boolean;
  providers: AIProvider[];
  routing: RoutingConfig;
}
