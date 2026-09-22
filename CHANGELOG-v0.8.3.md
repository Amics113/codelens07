# CodeLens v0.8.3

- Added **Automatic IDE analysis** switch to the desktop app Settings.
- VS Code tab now has separate **Analyze code**, **Improve code**, and **Explain code** actions.
- VS Code sends the active file automatically after 5 seconds of inactivity.
- IDE compiler/linter errors are forwarded automatically when they appear.
- The desktop app performs automatic AI analysis only when Automatic IDE analysis is enabled.
- Current and previous code are passed together when available so the AI can compare changes.
- Desktop configuration is persisted locally in the app webview; API keys remain outside the React config.
- VS Code extension remains read-only and does not edit files, run commands, or use Git.
