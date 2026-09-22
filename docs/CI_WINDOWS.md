# Windows CI

The included GitHub Actions workflow builds CodeLens on a Microsoft-hosted Windows runner. This avoids requiring every developer workstation to compile Tauri successfully.

For release hardening, add:
1. pinned toolchain versions;
2. dependency auditing;
3. SBOM generation;
4. reproducible build controls where practical;
5. Authenticode signing in a protected CI environment;
6. artifact hash publication;
7. malware/reputation review;
8. release approval.

Never commit signing certificates or API keys. Use CI secret storage/HSM-backed signing where available.
