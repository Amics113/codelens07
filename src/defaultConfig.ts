import type { AppConfig } from "./types";

export const defaultConfig: AppConfig = {
  enabled: true,
  focusMode: false,
  networkLock: false,
  telemetry: false,
  privacyMode: "local_only",
  contextLevel: "balanced",
  sensitivity: "balanced",
  automaticAnalysis: true,
  providers: [],
  routing: {
    errorAnalysis: "automatic",
    explanation: "ask",
    betterSolution: "automatic",
    debugging: "ask",
    security: "fixed",
    performance: "automatic",
    testing: "ask",
    architecture: "ask"
  }
};
