import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  safeStorage,
  dialog,
} from "electron";
import { join } from "node:path";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { startDemo } from "../../../packages/core/src/server";
let win: BrowserWindow;
let demo: Awaited<ReturnType<typeof startDemo>>;
let mode: "demo" | "live" = "demo";
let live: { url: string; token: string } | null = null;
const root = __dirname;
const userPath = () => process.env.DMFLOW_DATA_DIR || app.getPath("userData");
function trusted(event: Electron.IpcMainInvokeEvent) {
  if (
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw Error("Untrusted caller");
}
const allowed = (url: string) => {
  const u = new URL(url);
  return (
    u.protocol === "https:" ||
    (u.protocol === "http:" && u.hostname === "127.0.0.1")
  );
};
async function start() {
  mkdirSync(userPath(), { recursive: true });
  demo = await startDemo(
    join(userPath(), "demo.sqlite"),
    readFileSync(join(root, "schema.sql"), "utf8"),
  );
  const config = join(userPath(), "connection.enc");
  if (existsSync(config) && safeStorage.isEncryptionAvailable()) {
    try {
      live = JSON.parse(safeStorage.decryptString(readFileSync(config)));
    } catch {
      live = null;
    }
  }
  ipcMain.handle(
    "request",
    async (event, path: string, method = "GET", body?: unknown) => {
      trusted(event);
      if (
        typeof path !== "string" ||
        !path.startsWith("/api/") ||
        path.includes("..") ||
        !["GET", "POST", "PUT"].includes(method)
      )
        throw Error("Invalid request");
      const target = mode === "demo" ? demo : live;
      if (!target) throw Error("Pair a live Worker first");
      const response = await fetch(target.url + path, {
        method,
        headers: {
          Authorization: `Bearer ${target.token}`,
          "Content-Type": "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
      const data = (await response.json()) as Record<string, any>;
      if (!response.ok) throw Error(data.error ?? "Request failed");
      return data;
    },
  );
  ipcMain.handle("open", async (event, url: string) => {
    trusted(event);
    if (!allowed(url)) throw Error("Unsupported link");
    await shell.openExternal(url);
  });
  ipcMain.handle("mode", async (event, next?: "demo" | "live") => {
    trusted(event);
    if (next) {
      if (!["demo", "live"].includes(next)) throw Error("Invalid mode");
      if (next === "live" && !live) throw Error("Pair a live Worker first");
      mode = next;
    }
    return { mode, paired: !!live, url: live?.url ?? "" };
  });
  ipcMain.handle("pair", async (event, url: string, code: string) => {
    trusted(event);
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw Error("Use the HTTPS Worker address");
    if (!safeStorage.isEncryptionAvailable())
      throw Error("OS credential encryption is unavailable");
    const base = u.origin,
      response = await fetch(base + "/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(20000),
      }),
      data = (await response.json()) as Record<string, any>;
    if (!response.ok) throw Error(data.error ?? "Pairing failed");
    live = { url: base, token: data.token };
    writeFileSync(config, safeStorage.encryptString(JSON.stringify(live)), {
      mode: 0o600,
    });
    return { ok: true };
  });
  ipcMain.handle("reset", async (event) => {
    trusted(event);
    if (mode !== "demo") throw Error("Reset is only available in demo");
    const result = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Cancel", "Reset demo"],
      defaultId: 0,
      cancelId: 0,
      message: "Reset demo data?",
      detail:
        "Your demo campaigns and activity will be replaced with the sample dataset. Live data is unaffected.",
    });
    if (result.response !== 1) return false;
    await demo.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(join(userPath(), "demo.sqlite" + suffix), { force: true });
    demo = await startDemo(
      join(userPath(), "demo.sqlite"),
      readFileSync(join(root, "schema.sql"), "utf8"),
    );
    return true;
  });
  win = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1080,
    minHeight: 740,
    title: "DMFlow",
    backgroundColor: "#f7f8fa",
    webPreferences: {
      preload: join(root, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_w, _p, cb) =>
    cb(false),
  );
  await win.loadFile(join(root, "renderer/index.html"));
  if (process.env.DMFLOW_SCREENSHOT) {
    setTimeout(async () => {
      const image = await win.webContents.capturePage();
      writeFileSync(process.env.DMFLOW_SCREENSHOT!, image.toPNG());
    }, 2500);
  }
}
app
  .whenReady()
  .then(start)
  .catch((e) => {
    dialog.showErrorBox("DMFlow could not start", e.message);
    app.quit();
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  void demo?.close();
});
