import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { hash, opaque } from "../packages/core/src/security";
if (!existsSync("workers/api/wrangler.local.json"))
  throw Error("Run npm run setup first");
const code = opaque(),
  expires = new Date(Date.now() + 600000).toISOString();
mkdirSync("work", { recursive: true });
const file = "work/pair.sql";
writeFileSync(
  file,
  `INSERT INTO pairing_codes VALUES('${await hash(code)}','pilot','${expires}',NULL);`,
  { mode: 0o600 },
);
try {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "dmflow",
      "--config",
      "workers/api/wrangler.local.json",
      "--remote",
      "--file",
      file,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw Error("Could not create pairing code");
  console.log(
    `\nSingle-use code (expires in 10 minutes):\n${code}\nPaste it in DMFlow → Settings → Pair this desktop.`,
  );
} finally {
  unlinkSync(file);
}
