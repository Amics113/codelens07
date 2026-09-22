# CodeLens VS Code Adapter

CodeLens v0.8.3 provides a read-only VS Code bridge. The extension sends the active file, language, workspace-relative path, diagnostics, and (when available) the previous file snapshot to the running CodeLens Windows desktop app through a local Windows named pipe.

## Install for development

From `vscode-extension`:

```powershell
npm install
npm run compile
```

Then open the `vscode-extension` folder in VS Code and press **F5** to launch the Extension Development Host.

The CodeLens tab provides:

- **Analyze code** — find errors, risks, and issues.
- **Improve code** — suggest a better implementation.
- **Explain code** — explain the current code.

The active file is read automatically. After 5 seconds without typing, the extension sends the latest code to the desktop app. Compiler/linter errors are sent immediately when VS Code reports them. Whether those contexts are analyzed by AI is controlled by **CodeLens → Settings → Automatic IDE analysis** in the desktop app.

## Security boundary

The extension does not modify files, execute commands, invoke PowerShell, run Git operations, or call cloud AI directly. The desktop application remains the policy and AI-routing authority. The adapter is read-only.


## CodeLens behavior

- The CodeLens panel opens beside the editor in the Extension Development Host.
- The active file is read automatically.
- IDE/compiler errors are sent for analysis automatically.
- When the user stops editing for 5 seconds, the latest code is sent for analysis.
- Automatic analysis can be enabled or disabled from **CodeLens desktop app → Settings → Automatic IDE analysis**.
- Results are returned to the VS Code CodeLens panel; the desktop window does not need to be used for viewing the result.
- **Find errors**, **Improve**, and **Explain** are compact manual actions.
- CodeLens remains read-only and never edits the user's files.
