CodeLens v0.6.2

# CodeLens for Windows — v0.4

CodeLens is a privacy-first, read-only-by-default Windows coding assistant.

## v0.4: Bring-your-own-key AI engine

This release adds a functional OpenAI-compatible provider engine:

- Local endpoints such as Ollama / LM Studio-compatible servers.
- Cloud OpenAI-compatible providers.
- Custom OpenAI-compatible endpoints.
- API-key entry directly in the app.
- API keys are never written to the React provider configuration.
- Session-only API keys are kept in native process memory.
- Optional persistent credentials use Windows Credential Manager.
- Connection testing and model discovery.
- Actual `/chat/completions` analysis requests.
- Network Lock enforced by the native backend.
- Non-local endpoints require HTTPS.
- Embedded credentials in endpoint URLs are rejected.
- Request size limited to 200 KB.
- 45-second AI request timeout.
- No redirects for provider requests.
- Secret redaction before AI analysis.
- No file writes, shell execution, Git operations, elevation, or autonomous actions.

## API keys

CodeLens does **not** create provider API keys. Users paste keys obtained from their chosen AI provider.

For cloud providers, the Add Provider screen contains an API-key field.

Two choices are available:

1. **Session-only** (default): the key is held in native process memory and is lost when CodeLens exits.
2. **Remember securely**: the key is stored through Windows Credential Manager and retrieved only by the native backend when needed.

The key is never returned to the React UI after storage and is not placed in `AppConfig`, prompts, logs, or source files.

## Supported provider style

v0.4 uses the OpenAI-compatible HTTP protocol:

- `GET /models`
- `POST /chat/completions`

This covers many local servers and cloud providers that expose that compatibility layer. Provider-specific native protocols are planned separately.

## Development

```powershell
npm install
npm run build
npm run tauri dev
```

For a Windows release:

```powershell
npm run tauri:build
```

If the local machine blocks Cargo build-script executables with Windows Application Control, use the included Windows GitHub Actions workflow rather than weakening host security.

## Security boundary

The intended flow is:

READ -> MINIMUM CONTEXT -> SECRET SCAN -> PERMISSION CHECK -> AI -> VALIDATE -> SHOW DIFF -> USER DECIDES

CodeLens does not grant the model arbitrary filesystem, shell, Git, registry, administrator, or installation authority.


## v0.4.1 provider verification
- Provider types are limited to Local AI and Cloud AI.
- Quick presets have been removed.
- Test connection requires a selected model.
- Cloud providers require an API key before testing or model discovery.
- A provider is marked connected only after a successful authenticated `/models` check that includes the selected model when the provider reports model IDs.
- Changing endpoint, type, credentials, or model clears the previous verified connection state.


## v0.5 Context Engine

CodeLens v0.5 builds a task-aware context package from user-selected sources, applies explicit context budgets, redacts detected secrets, and sends only the resulting request to the selected provider. The desktop app remains read-only by default: it does not modify files, execute commands, commit code, or push code.
