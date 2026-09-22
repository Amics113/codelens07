# Native Windows Security Boundary

Production implementation should place provider credentials in Windows secure credential storage.
Do not store API keys in JSON, SQLite, logs, or the frontend.

This module is intentionally isolated so Windows credential handling can be tested independently.
