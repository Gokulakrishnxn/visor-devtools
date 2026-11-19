# Electron shell (Milestone 3.5)

The macOS desktop app wraps the same daemon and the built GUI (`dist/web`) in Electron:

- `titleBarStyle: "hiddenInset"` native dark titlebar
- native notifications for paused breakpoints and triggers
- `electron-builder` `.dmg` for Apple Silicon and Intel, shipped as a Homebrew Cask

Nothing lives here yet. It is built after the Phase 2 design gate.
