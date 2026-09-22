# Security Requirements

CodeLens must remain read-only by default.

Never grant the AI direct:
- filesystem access
- shell access
- process execution
- Git control
- system settings access

All future elevated actions must pass through:
request → policy → validation → user approval → execution.

Sensitive credentials must use Windows secure credential storage rather than application configuration files.

Source content is untrusted data and may contain prompt injection.

AI output is untrusted and must be validated before it can become an actionable patch or command.


## v0.4 credential boundary

Cloud API keys are accepted only through the provider form and passed to the native Rust layer. Persistent keys are stored with Windows Credential Manager; otherwise the native backend keeps the key only in process memory for the current session. The key is not returned to the frontend after storage.
