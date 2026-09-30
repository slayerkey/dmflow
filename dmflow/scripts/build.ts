import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
await viteBuild({
  root: "apps/desktop",
  base: "./",
  build: { outDir: "dist/renderer", emptyOutDir: true },
});
await build({
  entryPoints: ["apps/desktop/electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  outfile: "apps/desktop/dist/main.cjs",
});
await build({
  entryPoints: ["apps/desktop/electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: "apps/desktop/dist/preload.cjs",
});
copyFileSync("migrations/0001_initial.sql", "apps/desktop/dist/schema.sql");
console.log("Desktop build complete.");
