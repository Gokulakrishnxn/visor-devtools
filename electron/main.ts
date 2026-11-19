import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from "electron";
import { startDaemon, type RunningDaemon } from "../src/server/server";

/**
 * V.I.S.O.R. for macOS: the same local daemon and GUI as `vhud`, in a native
 * window. The daemon runs in-process on a free 127.0.0.1 port with a fresh
 * per-launch token; nothing listens beyond this machine.
 */

type Settings = { workspacePath: string | null; runtime: "mock" | "claude" };

const settingsPath = () => join(app.getPath("userData"), "settings.json");

function loadSettings(): Settings {
  try {
    return { workspacePath: null, runtime: "mock", ...(JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<Settings>) };
  } catch {
    return { workspacePath: null, runtime: "mock" };
  }
}

function saveSettings(s: Settings) {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
}

/** Asks the OS for an unused loopback port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** The built GUI sits next to the bundled main process. */
const staticDir = () => [join(__dirname, "../dist/web"), join(__dirname, "../web")].find((d) => existsSync(join(d, "index.html")));

let settings: Settings;
let daemon: RunningDaemon | null = null;
let win: BrowserWindow | null = null;

async function startOrRestart() {
  await daemon?.close();
  daemon = startDaemon({
    port: await freePort(),
    workspacePath: settings.workspacePath ?? homedir(),
    staticDir: staticDir(),
    runtime: settings.runtime,
  });
  const url = `${daemon.url}/?token=${daemon.token}`;
  if (win) await win.loadURL(url);
  return url;
}

async function chooseWorkspace(required: boolean): Promise<boolean> {
  const res = await dialog.showOpenDialog({
    title: "Choose a workspace folder",
    message: "V.I.S.O.R. runs Claude in this folder and reads its .visor.json.",
    defaultPath: settings.workspacePath ?? homedir(),
    properties: ["openDirectory", "createDirectory"],
  });
  if (res.canceled || !res.filePaths[0]) {
    if (required) settings.workspacePath = homedir();
    return false;
  }
  settings.workspacePath = res.filePaths[0];
  saveSettings(settings);
  return true;
}

async function setRuntime(runtime: Settings["runtime"]) {
  if (runtime === settings.runtime) return;
  if (runtime === "claude") {
    const { response } = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Switch to Live", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message: "Run the real Claude Agent SDK?",
      detail:
        "Live runs spend real money on your Anthropic account. Every tool call still goes through V.I.S.O.R.'s rules and pause cards, and your budget cap and credit apply. Needs ANTHROPIC_API_KEY or an `ant auth login` profile.",
    });
    if (response !== 0) return buildMenu();
  }
  settings.runtime = runtime;
  saveSettings(settings);
  buildMenu();
  await startOrRestart();
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            if (await chooseWorkspace(false)) await startOrRestart();
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "Runtime",
      submenu: [
        { label: "Mock (free demo)", type: "radio", checked: settings.runtime === "mock", click: () => void setRuntime("mock") },
        { label: "Live · Claude Agent SDK", type: "radio", checked: settings.runtime === "claude", click: () => void setRuntime("claude") },
      ],
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "V.I.S.O.R.",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#141414",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => win?.show());

  // Only the local daemon renders in the window; everything else opens outside
  const isLocal = (u: string) => daemon !== null && u.startsWith(daemon.url);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (isLocal(url)) return;
    e.preventDefault();
    if (/^(https?|cursor|vscode|zed):/.test(url)) void shell.openExternal(url);
  });
  win.on("closed", () => (win = null));

  await win.loadURL(await startOrRestart());
  if (process.env.VISOR_SCREENSHOTS) void captureScreenshots(process.env.VISOR_SCREENSHOTS);
}

/** README screenshots of the mock demo: `VISOR_SCREENSHOTS=dir electron .` */
async function captureScreenshots(dir: string) {
  mkdirSync(dir, { recursive: true });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const js = (code: string) => win!.webContents.executeJavaScript(code);
  const shot = async (name: string) => writeFileSync(join(dir, name), (await win!.webContents.capturePage()).toPNG());
  // Wait for the pause card of the auto-started demo
  for (let i = 0; i < 60 && !(await js("!!document.querySelector('[role=alertdialog]')")); i++) await wait(500);
  await wait(600);
  await shot("paused.png");
  await js("[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Approve'))?.click()");
  for (let i = 0; i < 60 && !(await js("document.querySelectorAll('section[aria-label^=Turn]').length === 2 && /Thought for[\\s\\S]*Thought for/.test(document.querySelector('main').innerText)")); i++) await wait(500);
  await js("document.querySelector('main .overflow-y-auto').scrollTop = 0");
  await js("[...document.querySelectorAll('main button')].find(b => b.innerText.startsWith('session.ts'))?.click()");
  await wait(1200);
  await shot("review.png");
  await js("document.querySelector('[aria-label=\"Close review\"]')?.click()");
  await js("document.querySelector('[aria-label=\"Toggle panel\"]').click()");
  await wait(300);
  await js("[...document.querySelectorAll('[role=tab]')].find(t => t.textContent === 'Cost')?.click()");
  await wait(800);
  await shot("inspector.png");
  app.quit();
}

// Never hang silently: a startup failure shows what went wrong, then quits
const fatal = (err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error("[visor] fatal:", message);
  if (app.isReady()) dialog.showErrorBox("V.I.S.O.R. couldn't start", message);
  app.exit(1);
};
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app
    .whenReady()
    .then(async () => {
    nativeTheme.themeSource = "dark"; // V.I.S.O.R. is dark only
    settings = loadSettings();
    // Scripted runs (screenshots, smoke tests) can point at a folder without the picker
    if (process.env.VISOR_WORKSPACE) settings.workspacePath = process.env.VISOR_WORKSPACE;
    if (!settings.workspacePath && !process.env.VISOR_SCREENSHOTS) await chooseWorkspace(true);
    buildMenu();
    await createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
    })
    .catch(fatal);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    void daemon?.close();
  });
}
