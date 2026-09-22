# Windows Setup

Install:

1. Node.js 20+
2. Rust stable
3. Microsoft C++ Build Tools with Desktop development with C++
4. Microsoft Edge WebView2
5. Git

Then:

```powershell
npm install
npm run tauri dev
```

Build:

```powershell
npm run tauri build
```

The initial bundle target is NSIS.

Before public release:
- enable application signing
- review installer permissions
- conduct Windows security testing
- test on clean Windows 10/11 machines
- verify WebView2 behavior
