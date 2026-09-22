# CodeLens v0.7.1

## Fix
- Fixed Windows named-pipe bridge imports for windows-sys 0.61.
- `ReadFile` and `WriteFile` now use `Win32::Storage::FileSystem`.
- `PIPE_ACCESS_DUPLEX` now uses the Windows storage/file-system module.
- Updated windows-sys feature flags accordingly.

No Git integration is included. The v0.7 IDE bridge remains read-only.
