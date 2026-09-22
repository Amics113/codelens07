# CodeLens Threat Model

## Assets

- Source code
- API keys
- credentials
- private project metadata
- terminal output
- AI provider configuration

## Threats

### Prompt injection
Untrusted source comments, README files, logs or terminal output attempt to instruct the model.

Mitigation:
Treat all retrieved content as data, never as policy.

### Credential leakage
API key appears in logs or prompts.

Mitigation:
Secure OS credential store, redaction, no prompt inclusion.

### Malicious patch
AI proposes a destructive file modification.

Mitigation:
Patch parser, path validation, diff preview, explicit approval.

### Malicious command
AI suggests a dangerous shell command.

Mitigation:
No execution by default. Future execution requires classification and explicit confirmation.

### Local impersonation
Another process tries to communicate with CodeLens as an IDE adapter.

Mitigation:
Authenticated local IPC and authorization.

### Path traversal
AI or adapter supplies an unexpected path.

Mitigation:
Normalize and validate paths against explicitly authorized workspace roots.

### Cloud leakage
Source is accidentally sent to a cloud model.

Mitigation:
Global privacy mode, local-only mode, secret scanner, minimum context, cloud approval.

## Security rule

When uncertain, deny.
