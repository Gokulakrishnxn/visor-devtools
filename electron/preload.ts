import { contextBridge } from "electron";

// The only thing the GUI learns about the desktop shell: that it is one, and
// on which OS, so it can leave room for the traffic lights and add drag areas.
contextBridge.exposeInMainWorld("visorDesktop", { platform: process.platform });

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.desktop = process.platform === "darwin" ? "mac" : "other";
});
