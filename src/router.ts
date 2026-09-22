import type { AIProvider, AppConfig, RoutingMode } from "./types";

export function chooseProvider(
  config: AppConfig,
  task: keyof AppConfig["routing"]
): AIProvider | null {
  const providers = config.providers.filter(p => p.enabled);
  if (!providers.length) return null;

  const mode = config.routing[task] as RoutingMode;

  if (config.privacyMode === "local_only") {
    return providers.find(p => p.kind === "local") ?? null;
  }

  if (mode === "fixed" && config.routing.fixedProviderId) {
    return providers.find(p => p.id === config.routing.fixedProviderId) ?? null;
  }

  if (mode === "automatic") {
    return providers.find(p => p.connected && p.kind === "local")
      ?? providers.find(p => p.connected)
      ?? providers[0];
  }

  return null;
}
