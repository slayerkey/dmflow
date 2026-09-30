import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SQLiteRepository } from "./sqlite";
import { Engine } from "./engine";
import { SimulatedProvider } from "../../instagram/src/index";
import { createApi } from "./api";
import { seed } from "./seed";
import { opaque } from "./security";
export async function startDemo(path: string, schema: string, port = 0) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new SQLiteRepository(path, schema);
  await seed(db);
  const token = opaque(),
    engine = new Engine(db, new SimulatedProvider(), "");
  const api = createApi({
    db,
    engine,
    demo: true,
    authorize: async (r) =>
      r.headers.get("authorization") === `Bearer ${token}` ? "demo" : null,
  });
  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host;
      if (host !== `127.0.0.1:${(server.address() as any).port}`) {
        res.writeHead(403);
        res.end("Invalid host");
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
      const body = Buffer.concat(chunks);
      const request = new Request(`http://${host}${req.url}`, {
        method: req.method,
        headers,
        ...(body.length ? { body } : {}),
      });
      const response = await api.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Local request failed");
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  engine.baseUrl = url;
  const interval = setInterval(
    () =>
      engine
        .recover()
        .then(() => engine.recoverOutbox())
        .catch(() => {}),
    10000,
  );
  interval.unref();
  return {
    url,
    token,
    db,
    engine,
    close: async () => {
      clearInterval(interval);
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    },
    reset: async () => {
      throw Error("Close and reopen the demo with a fresh database to reset.");
    },
  };
}
