# CodeLens v0.7.0

## VS Code integration
- Added a read-only Windows named-pipe bridge between the VS Code adapter and the CodeLens desktop app.
- Captures selected code, current file when no selection exists, language ID, workspace-relative path, and VS Code diagnostics.
- Added commands: Find Error, Explain Code, Suggest Better Solution, Security Analysis, Performance Analysis, Generate Tests.
- Added editor context-menu entries for these actions.
- Desktop app polls the bridge and imports IDE context into the Context Engine.
- No Git integration.
- No file modification, shell execution, PowerShell, Git operations, commits, or pushes.
