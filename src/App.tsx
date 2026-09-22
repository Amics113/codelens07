import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { defaultConfig } from "./defaultConfig";
import type { AppConfig, AIProvider, PrivacyMode, RoutingMode, ProviderKind, ProviderService } from "./types";
import { PROVIDER_PRESETS, presetFor, inferService } from "./providerCatalog";
import { chooseProvider } from "./router";
import { redactSecrets } from "./security";

type View = "assistant" | "providers" | "routing" | "privacy" | "permissions" | "settings";
type BridgeContext = {
  task?: "errorAnalysis" | "explanation" | "betterSolution";
  language?: string;
  filePath?: string;
  code?: string;
  previousCode?: string;
  diagnostics?: string;
  manual?: boolean;
  requestId?: string;
};

const nav: Array<[View, string]> = [
  ["assistant", "Assistant"],
  ["providers", "AI Providers"],
  ["routing", "AI Routing"],
  ["privacy", "Privacy"],
  ["permissions", "Permissions"],
  ["settings", "Settings"]
];

async function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

function App() {
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const saved = localStorage.getItem("codelens.config.v0.8");
      if (!saved) return defaultConfig;
      const parsed = JSON.parse(saved) as Partial<AppConfig>;
      return {
        ...defaultConfig,
        ...parsed,
        routing: { ...defaultConfig.routing, ...(parsed.routing ?? {}) },
        providers: Array.isArray(parsed.providers) ? parsed.providers : defaultConfig.providers
      };
    } catch { return defaultConfig; }
  });
  const [view, setView] = useState<View>("assistant");
  const [query, setQuery] = useState("");
  const [codeContext, setCodeContext] = useState("");
  const [previousCode, setPreviousCode] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [task, setTask] = useState<Exclude<keyof AppConfig["routing"], "fixedProviderId">>("betterSolution");
  const [language, setLanguage] = useState("");
  const [filePath, setFilePath] = useState("");
  const [diagnostics, setDiagnostics] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [includeCode, setIncludeCode] = useState(true);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [includeTerminal, setIncludeTerminal] = useState(false);
  const [includeFilePath, setIncludeFilePath] = useState(false);
  const [showRedactedPreview, setShowRedactedPreview] = useState(false);
  const [providerName, setProviderName] = useState("");
  const [providerEndpoint, setProviderEndpoint] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [providerKind, setProviderKind] = useState<ProviderKind>("local");
  const [providerService, setProviderService] = useState<ProviderService>("ollama");
  const [customEndpoint, setCustomEndpoint] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEndpoint, setEditEndpoint] = useState("");
  const [editKind, setEditKind] = useState<ProviderKind>("local");
  const [editService, setEditService] = useState<ProviderService>("ollama");
  const [editCustomEndpoint, setEditCustomEndpoint] = useState(false);
  const [editApiKey, setEditApiKey] = useState("");
  const [editRememberKey, setEditRememberKey] = useState(false);
  const [newModels, setNewModels] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [ideBridge, setIdeBridge] = useState("Windows named pipe · read-only");
  const [bridgeContext, setBridgeContext] = useState<BridgeContext | null>(null);
  const lastAutoContextRef = useRef("");

  const selectedProvider = useMemo(() => chooseProvider(config, task), [config, task]);

  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    try { localStorage.setItem("codelens.config.v0.8", JSON.stringify(config)); } catch { /* persistence is best-effort */ }
  }, [config]);

  useEffect(() => {
    const candidates = PROVIDER_PRESETS.filter(p => p.kind === providerKind);
    if (!candidates.some(p => p.id === providerService)) {
      setProviderService(candidates[0]?.id ?? "custom");
    }
    if (providerKind === "local") setProviderApiKey("");
  }, [providerKind]);

  useEffect(() => {
    if (!customEndpoint) {
      const preset = presetFor(providerService);
      if (preset) setProviderEndpoint(preset.endpoint);
    }
  }, [providerService, customEndpoint]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const info = await native<{ transport: string; read_only: boolean }>("vscode_bridge_status");
        if (alive) setIdeBridge(`${info.transport} · ${info.read_only ? "read-only" : "restricted"}`);
        const ctx = await native<BridgeContext | null>("get_vscode_context");
        if (!alive || !ctx) return;
        if (ctx.task) setTask(ctx.task);
        if (ctx.language) setLanguage(ctx.language);
        if (ctx.filePath) { setFilePath(ctx.filePath); setIncludeFilePath(true); }
        if (typeof ctx.code === "string") { setCodeContext(ctx.code); setIncludeCode(true); }
        if (typeof ctx.diagnostics === "string") { setDiagnostics(ctx.diagnostics); setIncludeDiagnostics(true); }
        if (typeof ctx.previousCode === "string") setPreviousCode(ctx.previousCode);
        setBridgeContext(ctx);
        setView("assistant");
        setQuery(ctx.task === "betterSolution" ? "Improve this code and explain the proposed improvements." : ctx.task === "explanation" ? "Explain this code clearly." : "Analyze the code automatically and find errors, risks, or issues. Explain the cause and give a solution.");
      } catch {
        if (alive) setIdeBridge("Bridge unavailable");
      }
    };
    poll();
    const timer = window.setInterval(poll, 800);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!editCustomEndpoint) {
      const preset = presetFor(editService);
      if (preset) setEditEndpoint(preset.endpoint);
    }
  }, [editService, editCustomEndpoint]);

  async function addProvider() {
    const name = providerName.trim();
    const endpoint = providerEndpoint.trim().replace(/\/+$/, "");
    const model = providerModel.trim();
    const preset = presetFor(providerService);
    if (!name) return;
    if (!endpoint) {
      setAnalysisError("Choose a provider service or enable Custom endpoint.");
      return;
    }
    if (providerKind === "cloud" && !providerApiKey.trim()) {
      setAnalysisError("Cloud AI requires an API key.");
      return;
    }

    const p: AIProvider = {
      id: crypto.randomUUID(),
      name,
      kind: providerKind,
      service: providerService,
      endpoint,
      model,
      models: model ? [model] : [],
      enabled: true,
      connected: false,
      capabilities: ["coding", "reasoning", "streaming"],
      credentialConfigured: false
    };

    try {
      if (providerApiKey.trim()) {
        await native("save_api_key", {
          providerId: p.id,
          apiKey: providerApiKey.trim(),
          persist: rememberApiKey
        });
        p.credentialConfigured = true;
      }
      update("providers", [...config.providers, p]);
      setStatus(prev => ({ ...prev, [p.id]: preset ? `${preset.label} configured — discover a model` : "Provider configured — discover a model" }));
      setProviderName("");
      setProviderEndpoint("");
      setProviderModel("");
      setProviderApiKey("");
      setRememberApiKey(false);
      setCustomEndpoint(false);
    } catch (error) {
      setAnalysisError(String(error));
    }
  }

  function toggleProvider(id: string) {
    update("providers", config.providers.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  }

  async function removeProvider(id: string) {
    const provider = config.providers.find(p => p.id === id);
    if (!provider) return;
    if (!window.confirm(`Remove provider "${provider.name}" and its stored API credential?`)) return;
    try { await native("delete_api_key", { providerId: id }); } catch { /* no credential is fine */ }
    update("providers", config.providers.filter(p => p.id !== id));
    if (config.routing.fixedProviderId === id) {
      update("routing", { ...config.routing, fixedProviderId: undefined });
    }
    if (editingId === id) setEditingId(null);
  }

  function startEdit(p: AIProvider) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditEndpoint(p.endpoint);
    setEditKind(p.kind);
    setEditService(p.service ?? inferService(p.kind, p.endpoint));
    setEditCustomEndpoint((p.service ?? inferService(p.kind, p.endpoint)) === "custom");
    setEditApiKey("");
    setEditRememberKey(false);
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editEndpoint.trim()) return;
    if (editKind === "cloud" && !editApiKey.trim() && !(config.providers.find(p => p.id === id)?.credentialConfigured)) {
      setAnalysisError("Cloud AI requires an API key.");
      return;
    }
    try {
      if (editApiKey.trim()) {
        await native("save_api_key", {
          providerId: id,
          apiKey: editApiKey.trim(),
          persist: editRememberKey
        });
      }
      update("providers", config.providers.map(p =>
        p.id === id ? {
          ...p,
          name: editName.trim(),
          endpoint: editEndpoint.trim().replace(/\/+$/, ""),
          kind: editKind,
          service: editService,
          credentialConfigured: editApiKey.trim() ? true : p.credentialConfigured,
          connected: false
        } : p
      ));
      setStatus(prev => ({ ...prev, [id]: editApiKey.trim() ? "Credential updated" : "Saved" }));
      setEditingId(null);
      setEditApiKey("");
    } catch (error) {
      setAnalysisError(String(error));
    }
  }

  async function clearCredential(providerId: string) {
    if (!window.confirm("Remove this provider API key from CodeLens and Windows Credential Manager?")) return;
    try {
      await native("delete_api_key", { providerId });
      update("providers", config.providers.map(p => p.id === providerId ? { ...p, credentialConfigured: false, connected: false } : p));
      setStatus(prev => ({ ...prev, [providerId]: "Credential removed" }));
    } catch (error) {
      setAnalysisError(String(error));
    }
  }

  async function testProvider(provider: AIProvider) {
    if (!provider.model.trim()) {
      update("providers", config.providers.map(p => p.id === provider.id ? { ...p, connected: false } : p));
      setStatus(prev => ({ ...prev, [provider.id]: "Cannot test: select a model first." }));
      return;
    }
    if (provider.kind === "cloud" && !provider.credentialConfigured) {
      update("providers", config.providers.map(p => p.id === provider.id ? { ...p, connected: false } : p));
      setStatus(prev => ({ ...prev, [provider.id]: "Cannot test: API key required." }));
      return;
    }
    setStatus(prev => ({ ...prev, [provider.id]: "Testing..." }));
    try {
      const result = await native<{ ok: boolean; message: string; modelCount?: number }>("test_provider", {
        providerId: provider.id,
        endpoint: provider.endpoint,
        kind: provider.kind,
        model: provider.model,
        networkLock: config.networkLock
      });
      update("providers", config.providers.map(p => p.id === provider.id ? { ...p, connected: result.ok } : p));
      setStatus(prev => ({ ...prev, [provider.id]: result.message }));
    } catch (error) {
      update("providers", config.providers.map(p => p.id === provider.id ? { ...p, connected: false } : p));
      setStatus(prev => ({ ...prev, [provider.id]: `Failed: ${String(error)}` }));
    }
  }

  async function discoverModels(provider: AIProvider) {
    setStatus(prev => ({ ...prev, [provider.id]: "Discovering models..." }));
    try {
      const models = await native<string[]>("discover_models", {
        providerId: provider.id,
        endpoint: provider.endpoint,
        kind: provider.kind,
        networkLock: config.networkLock
      });
      update("providers", config.providers.map(p =>
        p.id === provider.id ? { ...p, models, model: p.model && models.includes(p.model) ? p.model : (models[0] ?? ""), connected: false } : p
      ));
      setStatus(prev => ({ ...prev, [provider.id]: `${models.length} model(s) found` }));
    } catch (error) {
      setStatus(prev => ({ ...prev, [provider.id]: `Failed: ${String(error)}` }));
    }
  }

  function removeModel(providerId: string, model: string) {
    const provider = config.providers.find(p => p.id === providerId);
    if (!provider) return;
    if (!window.confirm(`Remove model "${model}"?`)) return;
    const models = provider.models.filter(m => m !== model);
    const activeModel = provider.model === model ? (models[0] ?? "") : provider.model;
    update("providers", config.providers.map(p =>
      p.id === providerId ? { ...p, models, model: activeModel, connected: false } : p
    ));
  }

  function addModel(providerId: string) {
    const model = (newModels[providerId] ?? "").trim();
    if (!model) return;
    update("providers", config.providers.map(p => {
      if (p.id !== providerId || p.models.includes(model)) return p;
      return { ...p, models: [...p.models, model], model: p.model || model, connected: false };
    }));
    setNewModels(prev => ({ ...prev, [providerId]: "" }));
  }

  function selectModel(providerId: string, model: string) {
    update("providers", config.providers.map(p => p.id === providerId ? { ...p, model, connected: false } : p));
  }

  function setRoute(key: keyof AppConfig["routing"], value: RoutingMode) {
    update("routing", { ...config.routing, [key]: value });
  }

  function buildContext(overrides?: { code?: string; previousCode?: string; diagnostics?: string; language?: string; filePath?: string; query?: string }) {
    const budgets = config.contextLevel === "minimal"
      ? { query: 4_000, code: 12_000, diagnostics: 8_000, terminal: 4_000, path: 500, language: 500 }
      : config.contextLevel === "deep"
        ? { query: 16_000, code: 100_000, diagnostics: 32_000, terminal: 25_000, path: 2_000, language: 2_000 }
        : { query: 8_000, code: 30_000, diagnostics: 16_000, terminal: 10_000, path: 1_000, language: 1_000 };

    const clip = (value: string, max: number) =>
      value.length <= max ? value : `${value.slice(0, max)}\n[TRUNCATED BY CONTEXT POLICY — ${value.length - max} characters omitted]`;

    const effectiveQuery = overrides?.query ?? query;
    const effectiveCode = overrides?.code ?? codeContext;
    const effectivePreviousCode = overrides?.previousCode ?? previousCode;
    const effectiveDiagnostics = overrides?.diagnostics ?? diagnostics;
    const effectiveLanguage = overrides?.language ?? language;
    const effectiveFilePath = overrides?.filePath ?? filePath;

    const sections: string[] = [];
    if (effectiveQuery.trim()) sections.push(`USER REQUEST:\n${clip(effectiveQuery.trim(), budgets.query)}`);
    else sections.push("USER REQUEST:\nAnalyze the supplied developer context.");

    if (includeCode && effectiveCode.trim()) sections.push(`CURRENT CODE / SOURCE:\n${clip(effectiveCode.trim(), budgets.code)}`);
    if (effectivePreviousCode.trim() && effectivePreviousCode.trim() !== effectiveCode.trim()) {
      sections.push(`PREVIOUS CODE / SOURCE (for comparison only):\n${clip(effectivePreviousCode.trim(), budgets.code)}`);
    }
    if (includeDiagnostics && effectiveDiagnostics.trim()) sections.push(`DIAGNOSTICS / ERRORS:\n${clip(effectiveDiagnostics.trim(), budgets.diagnostics)}`);
    if (includeTerminal && terminalOutput.trim()) sections.push(`TERMINAL OUTPUT:\n${clip(terminalOutput.trim(), budgets.terminal)}`);
    if (includeFilePath && effectiveFilePath.trim()) sections.push(`FILE PATH:\n${clip(effectiveFilePath.trim(), budgets.path)}`);
    if (effectiveLanguage.trim()) sections.push(`LANGUAGE / STACK:\n${clip(effectiveLanguage.trim(), budgets.language)}`);

    return sections.join("\n\n");
  }

  function contextStats() {
    const raw = buildContext();
    const redacted = redactSecrets(raw);
    return {
      rawChars: raw.length,
      redactedChars: redacted.redacted.length,
      secrets: redacted.count,
      categories: redacted.categories
    };
  }

  function publishBridgeResult(
    bridge: BridgeContext | undefined,
    status: "analyzing" | "complete" | "error",
    task: string,
    text = "",
    error = ""
  ) {
    if (!bridge?.requestId) return;
    void native("set_vscode_result", {
      requestId: bridge.requestId,
      status,
      task,
      text,
      error,
      filePath: bridge.filePath ?? ""
    }).catch(() => { /* VS Code bridge may be closed. */ });
  }

  async function analyze(bridge?: BridgeContext) {
    setAnalysis("");
    setAnalysisError("");
    const provider = selectedProvider;
    const effectiveTask = bridge?.task ?? task;
    if (!provider) {
      const message = "No eligible AI provider. Configure a provider or change the privacy/routing settings.";
      setAnalysisError(message);
      publishBridgeResult(bridge, "error", effectiveTask, "", message);
      setView("providers");
      return;
    }
    if (!provider.model) {
      const message = "Select a model before analyzing.";
      setAnalysisError(message);
      publishBridgeResult(bridge, "error", effectiveTask, "", message);
      setView("providers");
      return;
    }
    if (config.privacyMode === "local_only" && provider.kind !== "local") {
      const message = "Privacy mode is Local Only, so this request cannot use a cloud provider.";
      setAnalysisError(message);
      publishBridgeResult(bridge, "error", effectiveTask, "", message);
      return;
    }
    if (config.networkLock && provider.kind !== "local") {
      const message = "Network Lock blocks cloud requests.";
      setAnalysisError(message);
      publishBridgeResult(bridge, "error", effectiveTask, "", message);
      return;
    }

    const rawContext = buildContext(bridge ? {
      code: typeof bridge.code === "string" ? bridge.code : undefined,
      previousCode: typeof bridge.previousCode === "string" ? bridge.previousCode : undefined,
      diagnostics: typeof bridge.diagnostics === "string" ? bridge.diagnostics : undefined,
      language: typeof bridge.language === "string" ? bridge.language : undefined,
      filePath: typeof bridge.filePath === "string" ? bridge.filePath : undefined,
      query: bridge.task === "betterSolution"
        ? "Improve this code and explain the proposed improvements."
        : bridge.task === "explanation"
          ? "Explain this code clearly."
          : "Analyze the code automatically and find errors, risks, or issues. Explain the cause and give a solution."
    } : undefined);
    if (rawContext.length > 200_000) {
      const message = "Context is larger than the 200 KB safety limit. Reduce the supplied context or choose Minimal context.";
      setAnalysisError(message);
      publishBridgeResult(bridge, "error", effectiveTask, "", message);
      return;
    }
    if (!rawContext.trim()) {
      const message = "Enter a question, code, diagnostics, or terminal output first.";
      setAnalysisError(message);
      publishBridgeResult(bridge, "error", effectiveTask, "", message);
      return;
    }

    const redacted = redactSecrets(rawContext);
    setAnalysisBusy(true);
    publishBridgeResult(bridge, "analyzing", effectiveTask);
    try {
      const taskLabels: Record<Exclude<keyof AppConfig["routing"], "fixedProviderId">, string> = {
        errorAnalysis: "error analysis",
        explanation: "code explanation",
        betterSolution: "better solution",
        debugging: "debugging",
        security: "security analysis",
        performance: "performance analysis",
        testing: "test generation",
        architecture: "architecture analysis",
      };
      const prompt = [
        `TASK: ${taskLabels[effectiveTask] ?? "code analysis"}`,
        `CONTEXT LEVEL: ${config.contextLevel}`,
        `SENSITIVITY: ${config.sensitivity}`,
        "",
        redacted.redacted,
        "",
        "Return a concise engineering analysis with: (1) diagnosis, (2) why it happens, (3) recommended solution, and (4) a proposed diff or code snippet when useful. If previous code is supplied, compare it with the current code and explain what changed and whether the change introduced or fixed an issue. Do not claim to have executed, modified, or verified anything."
      ].join("\n");

      const result = await native<{ text: string; model: string; provider: string }>("ai_chat", {
        providerId: provider.id,
        endpoint: provider.endpoint,
        kind: provider.kind,
        model: provider.model,
        prompt,
        networkLock: config.networkLock,
        privacyMode: config.privacyMode
      });
      setAnalysis(result.text);
      setStatus(prev => ({ ...prev, __analysis: `Analyzed with ${result.provider} / ${result.model}` }));
      publishBridgeResult(bridge, "complete", effectiveTask, result.text);
    } catch (error) {
      const message = String(error);
      setAnalysisError(message);
      publishBridgeResult(bridge, "error", effectiveTask, "", message);
    } finally {
      setAnalysisBusy(false);
    }
  }

  useEffect(() => {
    if (!bridgeContext || (!config.automaticAnalysis && !bridgeContext.manual) || (!config.enabled && !bridgeContext.manual)) return;
    const signature = JSON.stringify([
      bridgeContext.filePath ?? "",
      bridgeContext.code ?? "",
      bridgeContext.previousCode ?? "",
      bridgeContext.diagnostics ?? "",
      bridgeContext.task ?? "",
      bridgeContext.manual ?? false
    ]);
    if (!signature || signature === lastAutoContextRef.current) return;
    lastAutoContextRef.current = signature;
    const timer = window.setTimeout(() => { void analyze(bridgeContext); }, 150);
    return () => window.clearTimeout(timer);
  }, [bridgeContext, config.automaticAnalysis, config.enabled]);

  const stats = contextStats();

  const navButtons = nav.map(([id, label]) => (
    <button key={id} className={view === id ? "nav active" : "nav"} onClick={() => setView(id)}>{label}</button>
  ));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="logo">◇</div><div><strong>CodeLens</strong><span>Windows developer assistant</span></div></div>
        <div className="status-card">
          <div className="status-row"><span className={config.enabled ? "dot on" : "dot"} /><span>{config.enabled ? "Active" : "Off"}</span><button className="tiny" onClick={() => update("enabled", !config.enabled)}>{config.enabled ? "Turn off" : "Turn on"}</button></div>
          <div className="muted">{config.privacyMode === "local_only" ? "Local-only privacy" : "Cloud-capable privacy"}</div>
        </div>
        <div className="nav-list">{navButtons}</div>
        <div className="sidebar-bottom"><div className="mini">Read-only by default</div><div className="mini">Telemetry: {config.telemetry ? "On" : "Off"}</div><div className="mini">Network: {config.networkLock ? "Locked" : "Available"}</div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">CODELENS / WINDOWS</div><h1>{nav.find(n => n[0] === view)?.[1]}</h1></div>
          <div className="top-actions">
            <button className="ghost" onClick={() => update("focusMode", !config.focusMode)}>{config.focusMode ? "Exit focus" : "Focus mode"}</button>
            <button className={config.networkLock ? "danger" : "ghost"} onClick={() => update("networkLock", !config.networkLock)}>{config.networkLock ? "Network locked" : "Network lock"}</button>
          </div>
        </header>

        {view === "assistant" && (
          <section className="content">
            <div className="hero">
              <div>
                <div className="pill">READ → MINIMIZE → REDACT → ANALYZE → SUGGEST</div>
                <h2>Understand your code. Stay in control.</h2>
                <p>CodeLens builds the smallest useful context from what you provide, scans it for secrets, applies your privacy policy, and asks the selected AI for an explanation or better solution. Nothing is automatically written or executed.</p>
              </div>
              <div className="hero-orb">◇</div>
            </div>

            <div className="grid">
              <div className="card context-card">
                <div className="card-title">Context Engine</div>
                <div className="grid two compact-grid">
                  <label>Task
                    <select value={task} onChange={e => setTask(e.target.value as Exclude<keyof AppConfig["routing"], "fixedProviderId">)}>
                      <option value="errorAnalysis">Find error</option>
                      <option value="explanation">Explain code</option>
                      <option value="betterSolution">Better solution</option>
                      <option value="debugging">Debug</option>
                      <option value="security">Security analysis</option>
                      <option value="performance">Performance</option>
                      <option value="testing">Generate tests</option>
                      <option value="architecture">Architecture</option>
                    </select>
                  </label>
                  <label>Language / stack
                    <input value={language} onChange={e => setLanguage(e.target.value)} placeholder="Java, Spring Boot, Python..." />
                  </label>
                </div>

                <label>Your request
                  <textarea value={query} onChange={e => setQuery(e.target.value)} placeholder="What should CodeLens analyze?" />
                </label>

                <div className="context-source-grid">
                  <label className="source-toggle"><input type="checkbox" checked={includeCode} onChange={e => setIncludeCode(e.target.checked)} /> Selected code</label>
                  <label className="source-toggle"><input type="checkbox" checked={includeDiagnostics} onChange={e => setIncludeDiagnostics(e.target.checked)} /> Diagnostics</label>
                  <label className="source-toggle"><input type="checkbox" checked={includeTerminal} onChange={e => setIncludeTerminal(e.target.checked)} /> Terminal output</label>
                  <label className="source-toggle"><input type="checkbox" checked={includeFilePath} onChange={e => setIncludeFilePath(e.target.checked)} /> File path</label>
                </div>

                {includeCode && <label>Selected code / source
                  <textarea value={codeContext} onChange={e => setCodeContext(e.target.value)} placeholder="Paste only the code you want CodeLens to read..." />
                </label>}
                {includeDiagnostics && <label>Diagnostics / errors
                  <textarea value={diagnostics} onChange={e => setDiagnostics(e.target.value)} placeholder="Compiler error, stack trace, linter output..." />
                </label>}
                {includeTerminal && <label>Terminal output
                  <textarea value={terminalOutput} onChange={e => setTerminalOutput(e.target.value)} placeholder="Paste relevant terminal output only..." />
                </label>}
                {includeFilePath && <label>File path
                  <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="C:\project\src\Main.java" />
                </label>}

                <div className="context-summary">
                  <div><span>Raw context</span><strong>{stats.rawChars.toLocaleString()} chars</strong></div>
                  <div><span>After redaction</span><strong>{stats.redactedChars.toLocaleString()} chars</strong></div>
                  <div><span>Secrets found</span><strong>{stats.secrets}</strong></div>
                  <div><span>Context policy</span><strong>{config.contextLevel} · budgeted</strong></div>
                </div>

                {stats.secrets > 0 && (
                  <div className="notice">
                    <strong>{stats.secrets} potential secret{stats.secrets === 1 ? "" : "s"} detected.</strong> They will be replaced before the AI request.
                    {stats.categories.length > 0 && <span> Categories: {stats.categories.join(", ")}.</span>}
                    <button className="tiny preview-button" onClick={() => setShowRedactedPreview(v => !v)}>{showRedactedPreview ? "Hide preview" : "Preview redacted context"}</button>
                  </div>
                )}
                {showRedactedPreview && <pre className="redacted-preview">{redactSecrets(buildContext()).redacted}</pre>}

                <div className="row between">
                  <span className="muted">AI: {selectedProvider ? `${selectedProvider.name} · ${selectedProvider.model}` : "none"} · read-only</span>
                  <button className="primary" disabled={analysisBusy} onClick={() => { void analyze(); }}>{analysisBusy ? "Analyzing..." : "Analyze"}</button>
                </div>
              </div>

              <div>
                <div className="card">
                  <div className="card-title">IDE Bridge</div>
                  <div className="provider-big">VS Code</div>
                  <div className="muted">{ideBridge}</div>
                  <span className="badge green">Read-only</span>
                  <div className="muted helper">The extension can send selected code and diagnostics. It cannot modify files or execute commands.</div>
                </div>

                <div className="card">
                  <div className="card-title">Current AI</div>
                  {selectedProvider ? <>
                    <div className="provider-big">{selectedProvider.name}</div>
                    <div className="muted">{selectedProvider.model || "No model"} · {selectedProvider.kind}</div>
                    <span className={selectedProvider.connected ? "badge green" : "badge"}>{selectedProvider.connected ? "Connected" : "Not tested"}</span>
                  </> : <div className="empty">No eligible AI provider configured.</div>}
                  <button className="ghost full" onClick={() => setView("providers")}>Manage providers</button>
                </div>

                <div className="card">
                  <div className="card-title">Context policy</div>
                  <div className="setting-row"><div><strong>Level</strong><span className="muted">Controls how much supplied context is included.</span></div><span className="badge">{config.contextLevel}</span></div>
                  <div className="setting-row"><div><strong>Secrets</strong><span className="muted">Redacted before requests.</span></div><span className="badge green">Protected</span></div>
                  <div className="setting-row"><div><strong>Writes</strong><span className="muted">AI cannot modify files.</span></div><span className="badge">Denied</span></div>
                </div>
              </div>
            </div>

            {analysisError && <div className="notice error-notice">{analysisError}</div>}
            {analysis && <div className="card analysis-card"><div className="card-title">AI analysis</div><pre className="analysis-text">{analysis}</pre><div className="row wrap-actions"><button className="ghost" disabled={analysisBusy} onClick={()=>{setTask("errorAnalysis"); void analyze();}}>Analyze again</button><button className="ghost" disabled={analysisBusy} onClick={()=>{setTask("explanation"); void analyze();}}>Explain code</button><button className="primary" disabled={analysisBusy} onClick={()=>{setTask("betterSolution"); void analyze();}}>Improve code</button></div></div>}

            <div className="card">
              <div className="card-title">Safety pipeline</div>
              <div className="pipeline">{["Read","Minimize","Secret scan","Permission check","Route","AI","Validate","Show diff"].map((x,i)=><div className="pipeline-step" key={x}><span>{i+1}</span>{x}</div>)}</div>
            </div>
          </section>
        )}

        {view === "providers" && (
          <section className="content">
            <div className="section-head"><div><h2>Your AI, your choice.</h2><p>Enter your own API key when a provider needs one. CodeLens never generates or supplies provider API keys.</p></div></div>
            <div className="notice"><strong>No endpoint hunting:</strong> choose the AI service and CodeLens fills the documented base endpoint automatically. You only need to enter a custom endpoint when your server is self-hosted or non-standard.</div>
            <div className="grid two">
              <div className="card">
                <div className="card-title">Add provider</div>
                <label>Provider type<select value={providerKind} onChange={e => setProviderKind(e.target.value as ProviderKind)}><option value="local">Local AI</option><option value="cloud">Cloud AI</option></select></label>
                <label>AI service<select value={providerService} onChange={e => { const v = e.target.value as ProviderService; setProviderService(v); setCustomEndpoint(v === "custom"); }}>
                  {PROVIDER_PRESETS.filter(p => p.kind === providerKind).map(p => <option value={p.id} key={p.id}>{p.label}</option>)}
                </select><div className="muted helper">{presetFor(providerService)?.description}</div></label>
                <label>Name<input value={providerName} onChange={e => setProviderName(e.target.value)} placeholder={presetFor(providerService)?.label ?? "Provider name"} /></label>
                <label>Endpoint
                  <input value={providerEndpoint} onChange={e => { setProviderEndpoint(e.target.value); setCustomEndpoint(true); }} readOnly={!customEndpoint && providerService !== "custom" && providerService !== "custom_local"} placeholder="Automatically selected" />
                  {!customEndpoint && providerService !== "custom" && providerService !== "custom_local" && <div className="muted helper">CodeLens selected this endpoint automatically. No URL lookup is required.</div>}
                  {providerService === "custom_local" && <div className="muted helper">Enter the localhost base URL for your local OpenAI-compatible server.</div>}
                  {providerService !== "custom" && providerService !== "custom_local" && <label className="checkbox-label"><input type="checkbox" checked={customEndpoint} onChange={e => setCustomEndpoint(e.target.checked)} /> Use a custom endpoint</label>}
                </label>
                <label>Initial model<input value={providerModel} onChange={e => setProviderModel(e.target.value)} placeholder="Optional — discover models after adding" /></label>
                {providerKind !== "local" && <label>API key<input type="password" autoComplete="off" value={providerApiKey} onChange={e => setProviderApiKey(e.target.value)} placeholder="Paste your provider API key" /></label>}
                {providerKind !== "local" && <div className="key-option"><label className="checkbox-label"><input type="checkbox" checked={rememberApiKey} onChange={e => setRememberApiKey(e.target.checked)} /> Remember securely in Windows Credential Manager</label><div className="muted">Off = session-only memory. On = Windows Credential Manager. The key is never put in the React config.</div></div>}
                <button className="primary full" disabled={!providerName.trim() || !providerEndpoint.trim() || (providerKind === "cloud" && !providerApiKey.trim())} onClick={addProvider}>Add provider</button>
              </div>

              <div className="card">
                <div className="card-title">Configured providers</div>
                {config.providers.length === 0 && <div className="empty">No providers yet.</div>}
                {config.providers.map(p => (
                  <div className="provider-card" key={p.id}>
                    {editingId === p.id ? (
                      <div className="edit-provider">
                        <label>Name<input value={editName} onChange={e => setEditName(e.target.value)} /></label>
                        <label>Type<select value={editKind} onChange={e => { const v = e.target.value as ProviderKind; setEditKind(v); const first = PROVIDER_PRESETS.find(x => x.kind === v); if (first) { setEditService(first.id); setEditCustomEndpoint(false); setEditEndpoint(first.endpoint); } }}><option value="local">Local AI</option><option value="cloud">Cloud AI</option></select></label>
                        <label>AI service<select value={editService} onChange={e => { const v = e.target.value as ProviderService; setEditService(v); setEditCustomEndpoint(v === "custom"); }}>{PROVIDER_PRESETS.filter(x => x.kind === editKind).map(x => <option value={x.id} key={x.id}>{x.label}</option>)}</select></label>
                        <label>Endpoint<input value={editEndpoint} readOnly={!editCustomEndpoint && editService !== "custom" && editService !== "custom_local"} onChange={e => { setEditEndpoint(e.target.value); setEditCustomEndpoint(true); }} /></label>
                        {!editCustomEndpoint && editService !== "custom" && editService !== "custom_local" && <div className="muted helper">Managed automatically from the selected service.</div>}
                        {editService === "custom_local" && <div className="muted helper">Enter the localhost base URL for your local OpenAI-compatible server.</div>}
                        {editService !== "custom" && editService !== "custom_local" && <label className="checkbox-label"><input type="checkbox" checked={editCustomEndpoint} onChange={e => setEditCustomEndpoint(e.target.checked)} /> Use a custom endpoint</label>}
                        {editKind !== "local" && <><label>New API key<input type="password" autoComplete="off" value={editApiKey} onChange={e => setEditApiKey(e.target.value)} placeholder="Leave blank to keep current credential" /></label><label className="checkbox-label"><input type="checkbox" checked={editRememberKey} onChange={e => setEditRememberKey(e.target.checked)} /> Remember securely in Windows Credential Manager</label></>}
                        <div className="row"><button className="primary" onClick={() => saveEdit(p.id)}>Save</button><button className="ghost" onClick={() => setEditingId(null)}>Cancel</button></div>
                      </div>
                    ) : (
                      <>
                        <div className="provider-row">
                          <div><strong>{p.name}</strong><div className="muted">{p.kind} · {presetFor(p.service ?? inferService(p.kind, p.endpoint))?.label ?? "OpenAI-compatible"} · {p.endpoint}</div></div>
                          <div className="row wrap-actions"><span className={p.connected ? "badge green" : "badge"}>{p.connected ? "Connected" : "Not tested"}</span><button className="tiny" onClick={() => toggleProvider(p.id)}>{p.enabled ? "Disable" : "Enable"}</button><button className="tiny" onClick={() => startEdit(p)}>Edit</button><button className="tiny danger-outline" onClick={() => removeProvider(p.id)}>Remove</button></div>
                        </div>
                        <div className="provider-tools">
                          {!p.model && <span className="muted">Select a model before testing.</span>}
                          {p.kind === "cloud" && !p.credentialConfigured && <span className="muted">Add an API key before testing.</span>}
                          <button className="ghost" disabled={!p.model || (p.kind === "cloud" && !p.credentialConfigured)} onClick={() => testProvider(p)}>Test connection</button>
                          <button className="ghost" disabled={p.kind === "cloud" && !p.credentialConfigured} onClick={() => discoverModels(p)}>Discover models</button>
                          {p.kind === "cloud" && <button className="ghost" onClick={() => clearCredential(p.id)}>Remove API key</button>}
                          <span className="muted">{status[p.id] ?? (p.credentialConfigured ? "API key configured" : p.kind === "local" ? "Local endpoint" : "No API key configured")}</span>
                        </div>
                        <div className="model-section">
                          <div className="model-head"><span className="card-title">Models</span><span className="muted">{p.models.length} configured</span></div>
                          {p.models.map(model => <div className={model === p.model ? "model-row selected" : "model-row"} key={model}><button className="model-select" onClick={() => selectModel(p.id, model)}><span className="model-radio">{model === p.model ? "●" : "○"}</span>{model}</button><button className="tiny danger-outline" onClick={() => removeModel(p.id, model)}>Remove</button></div>)}
                          <div className="add-model-row"><input value={newModels[p.id] ?? ""} onChange={e => setNewModels(prev => ({...prev,[p.id]:e.target.value}))} placeholder="Add another model" /><button className="ghost" onClick={() => addModel(p.id)}>Add model</button></div>
                          <div className="muted helper">Active model: <strong>{p.model || "none"}</strong>.</div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="notice"><strong>Credential boundary:</strong> CodeLens never creates API keys. You paste your own provider key. If you choose persistent storage, only the credential is stored in Windows Credential Manager; provider configuration and source context are not stored by this foundation.</div>
          </section>
        )}

        {view === "routing" && <section className="content"><div className="section-head"><div><h2>AI routing</h2><p>Choose Fixed, Ask Every Time, or Automatic independently for each feature.</p></div></div><div className="card">{([
          ["errorAnalysis","Error analysis"],["explanation","Code explanation"],["betterSolution","Better solution"],["debugging","Debugging"],["security","Security"],["performance","Performance"],["testing","Testing"],["architecture","Architecture"]
        ] as const).map(([key,label])=><div className="setting-row" key={key}><div><strong>{label}</strong><span className="muted">AI selection policy</span></div><select value={config.routing[key]} onChange={e=>setRoute(key,e.target.value as RoutingMode)}><option value="fixed">Fixed</option><option value="ask">Ask Every Time</option><option value="automatic">Automatic</option></select></div>)}<label>Fixed provider<select value={config.routing.fixedProviderId ?? ""} onChange={e=>update("routing",{...config.routing,fixedProviderId:e.target.value||undefined})}><option value="">Choose provider</option>{config.providers.filter(p=>p.enabled).map(p=><option value={p.id} key={p.id}>{p.name} — {p.model || "no model"}</option>)}</select></label></div></section>}

        {view === "privacy" && <section className="content"><div className="section-head"><div><h2>Privacy</h2><p>Global privacy policy overrides automatic AI routing.</p></div></div><div className="card"><label>Privacy mode<select value={config.privacyMode} onChange={e=>update("privacyMode",e.target.value as PrivacyMode)}><option value="local_only">Maximum Privacy — Local Only</option><option value="balanced">Balanced</option><option value="ask_before_cloud">Ask Before Cloud</option><option value="cloud_allowed">Cloud Allowed</option></select></label><label>Context level<select value={config.contextLevel} onChange={e=>update("contextLevel",e.target.value as AppConfig["contextLevel"])}><option value="minimal">Minimal</option><option value="balanced">Balanced</option><option value="deep">Deep</option></select></label><div className="privacy-grid"><div><span>Persistent source storage</span><strong>Disabled</strong></div><div><span>Telemetry</span><strong>{config.telemetry?"Enabled":"Disabled"}</strong></div><div><span>Network</span><strong>{config.networkLock?"Locked":"Available"}</strong></div><div><span>Default write access</span><strong>Denied</strong></div></div></div></section>}

        {view === "permissions" && <section className="content"><div className="section-head"><div><h2>Permissions</h2><p>AI does not receive direct filesystem or shell authority.</p></div></div><div className="card permissions">{[["Read selected source",true],["Read diagnostics",true],["Read terminal output",true],["Modify files",false],["Delete files",false],["Execute commands",false],["Git commit",false],["Git push",false],["Install software",false],["Access arbitrary filesystem paths",false]].map(([name,allowed])=><div className="permission-row" key={name as string}><span>{name as string}</span><span className={allowed?"allow":"deny"}>{allowed?"ALLOWED":"DENIED"}</span></div>)}</div></section>}

        {view === "settings" && <section className="content"><div className="section-head"><div><h2>Settings</h2><p>Developer-focused controls.</p></div></div><div className="card"><div className="setting-row"><div><strong>Automatic IDE analysis</strong><span className="muted">When ON, CodeLens automatically analyzes the latest IDE code after 5 seconds of inactivity and returns the diagnosis, cause, and solution to the VS Code CodeLens tab. Turn it OFF to stop automatic AI analysis.</span></div><button className={config.automaticAnalysis?"toggle on":"toggle"} onClick={()=>update("automaticAnalysis",!config.automaticAnalysis)}>{config.automaticAnalysis?"ON":"OFF"}</button></div><label>Analysis sensitivity<select value={config.sensitivity} onChange={e=>update("sensitivity",e.target.value as AppConfig["sensitivity"])}><option value="minimal">Minimal</option><option value="balanced">Balanced</option><option value="proactive">Proactive</option></select></label><div className="toggle-row"><span>Telemetry</span><button className={config.telemetry?"toggle on":"toggle"} onClick={()=>update("telemetry",!config.telemetry)}>{config.telemetry?"ON":"OFF"}</button></div><div className="toggle-row"><span>Focus mode</span><button className={config.focusMode?"toggle on":"toggle"} onClick={()=>update("focusMode",!config.focusMode)}>{config.focusMode?"ON":"OFF"}</button></div><div className="toggle-row"><span>Network lock</span><button className={config.networkLock?"toggle on":"toggle"} onClick={()=>update("networkLock",!config.networkLock)}>{config.networkLock?"ON":"OFF"}</button></div></div></section>}
      </main>
    </div>
  );
}

export default App;
