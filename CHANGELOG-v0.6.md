# CodeLens v0.6.0

## Provider compatibility and endpoint management

- Added service-aware provider catalog while retaining only two provider types: Local AI and Cloud AI.
- Automatic documented base endpoints for Ollama, LM Studio, LocalAI, OpenAI, Google Gemini (OpenAI-compatible), OpenRouter, Groq, and DeepSeek.
- Optional custom endpoint mode for self-hosted/non-standard OpenAI-compatible servers.
- Endpoint helper text explains that users should enter a base URL, not `/models` or `/chat/completions`.
- Backend normalizes accidental operation suffixes (`/models`, `/chat/completions`, `/responses`) before validation.
- Cloud provider creation requires an API key.
- Add-provider button is disabled until required fields are present.
- Existing providers are backward-compatible through endpoint-based service inference.
- Provider type remains strictly Local AI or Cloud AI.
