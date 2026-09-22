# CodeLens Windows Security Model

CodeLens is designed as a read-only-by-default desktop assistant. The AI provider is an unprivileged data consumer, not an operating-system agent.

## Non-negotiable defaults
- No autonomous file modification.
- No autonomous command execution.
- No Git commit/push.
- No administrator elevation.
- No telemetry by default.
- No persistent source-code storage by the core.
- Secrets are redacted before cloud requests.
- Cloud use is opt-in and policy-controlled.
- Unknown actions fail closed.

## Windows integration
Use Windows credential protection for provider secrets in the native implementation; never place API keys in frontend localStorage, project files, or logs.

Release builds should be code-signed and distributed through a trusted Windows packaging channel. CI builds are separated from the developer workstation.

## Important limitation
This repository is a security-oriented foundation. OS-level enforcement, credential vault integration, signing certificates, and enterprise policy validation must be completed and audited before claiming the application is production-secure.
