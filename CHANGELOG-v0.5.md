# CodeLens v0.5 — Context Engine

## Added
- Task-aware analysis routing instead of hard-coded `betterSolution` routing.
- Context Engine with separate inputs for:
  - user request
  - selected code/source
  - diagnostics/errors
  - terminal output
  - file path
  - language/stack
- Per-source include/exclude controls.
- Minimal, Balanced, and Deep context budgets with explicit truncation markers.
- Context size and secret-detection statistics before an AI request.
- Redacted-context preview when secrets are detected.
- Structured analysis prompts with task, context level, and sensitivity metadata.
- Expanded safety pipeline: Read → Minimize → Secret scan → Permission check → Route → AI → Validate → Show diff.
- Read-only analysis contract remains enforced; no file or command authority is granted.

## Security
- Secret redaction remains local to the CodeLens frontend before cloud requests.
- Native backend continues to enforce the 200 KB request limit, endpoint validation, privacy mode, and credential boundary.
- No source persistence or telemetry is introduced by this stage.
