import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("dmflow", {
  request: (path: string, method?: string, body?: unknown) =>
    ipcRenderer.invoke("request", path, method, body),
  open: (url: string) => ipcRenderer.invoke("open", url),
  mode: (next?: string) => ipcRenderer.invoke("mode", next),
  pair: (url: string, code: string) => ipcRenderer.invoke("pair", url, code),
  reset: () => ipcRenderer.invoke("reset"),
});
