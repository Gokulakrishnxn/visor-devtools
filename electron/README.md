# macOS app

The desktop shell runs the same daemon and GUI as `vhud`, in-process on a free `127.0.0.1` port with a fresh token.

| File | What it does |
| --- | --- |
| `main.ts` | Window (native dark `hiddenInset` title bar), menus (File → Open Folder, Runtime → Mock / Live), external links, single instance, startup error dialog, screenshot mode |
| `preload.ts` | Tells the GUI it's in the desktop app so it leaves room for the traffic lights |
| `builder.json` | electron-builder config: `.dmg` for Apple Silicon and Intel, one Claude binary and one SQLite build per architecture |

```bash
pnpm desktop     # build, stage and open the app
pnpm dist:mac    # .dmg files in release/dist (unsigned)
```

`scripts/stage-desktop.mjs` assembles the app in `release/app` with only its runtime packages, so native modules are built for Electron there while the repo's stay built for Node. It refuses to stage a bundle that needs any other package.

Scripted runs: `VISOR_WORKSPACE=/path VISOR_DB=/tmp/traces.db VISOR_SCREENSHOTS=docs/screenshots pnpm desktop` captures the README screenshots from the free mock demo and quits.
