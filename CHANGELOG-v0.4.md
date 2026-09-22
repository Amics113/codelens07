# CodeLens v0.4.0

## Added
- Bring-your-own API key field for cloud/custom providers.
- Quick provider presets for common OpenAI-compatible endpoints.
- Session-only API key mode by default.
- Optional Windows Credential Manager persistence.
- Native Rust credential commands: save, delete, and lookup.
- Native provider connection testing.
- Native model discovery via `/models`.
- Native AI chat requests via `/chat/completions`.
- Native network-lock enforcement.
- HTTPS enforcement for non-local endpoints.
- Endpoint credential rejection.
- 200 KB request limit and request timeouts.
- Assistant code/context input and real analysis output.
- Cloud/local privacy enforcement in native backend.

## Security note
CodeLens does not create API keys. Use the key issued by your chosen provider. Never paste a key into source code, prompts, screenshots, Git, or issue trackers.


## v0.4.1 — Provider verification hardening
- Removed quick provider presets.
- Provider type is now only Local AI or Cloud AI.
- Test connection is blocked until a model is selected.
- Cloud test/model discovery requires an API key.
- Connection status is invalidated when provider configuration changes.
- Native validation rejects unsupported provider kinds.
