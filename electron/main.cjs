// Anemiascope desktop shell. Loads the published app (server lookups need the hosted backend).
// Patient data and ektacytometry files still stay in the window's memory / local storage only.
const { app, BrowserWindow, shell } = require("electron");

const APP_URL = process.env.ANEMIASCOPE_URL || "https://anemiascope.lovable.app";
const APP_ORIGIN = new URL(APP_URL).origin;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Anemiascope",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // External database links open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_ORIGIN)) shell.openExternal(url);
    return { action: url.startsWith(APP_ORIGIN) ? "allow" : "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(APP_ORIGIN)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.loadURL(APP_URL);
}

if (!app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
