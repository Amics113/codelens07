# CodeLens v0.4 — Windows setup

## 1. Install

```cmd
npm install
```

## 2. Validate frontend

```cmd
npm run build
```

## 3. Run

```cmd
npm run tauri dev
```

## 4. Configure AI

Open **AI Providers**.

### Local AI

Choose:

`Ollama / Local`

Endpoint:

`http://localhost:11434/v1`

Leave API key blank if your local server does not require one.

Click **Add provider**, then **Discover models**.

### Cloud AI

Choose a preset such as OpenAI, OpenRouter, Groq, or DeepSeek.

Paste **your own** API key.

By default, the key is session-only. If you check **Remember securely in Windows Credential Manager**, the native Windows credential store is used.

Then add the provider, test the connection, discover/select a model, and use **Assistant → Analyze**.

## Security behavior

- Cloud requests are blocked by Local Only privacy mode.
- Network Lock blocks non-local endpoints.
- Non-local endpoints must use HTTPS.
- API keys are never put into the React config.
- Source context is not persisted by this foundation.
- The AI cannot modify files or execute commands.

## If Windows blocks Cargo

Do not disable Windows security controls just to compile. Use the GitHub Actions Windows build workflow in `.github/workflows/windows-build.yml`.


## v0.5 Context Engine
Open Assistant to build a task-specific context package. Choose the task, select which sources are included, review redaction statistics, and then analyze. Minimal/Balanced/Deep context budgets are enforced in the UI before the native 200 KB request limit.
