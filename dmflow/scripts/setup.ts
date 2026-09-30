import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const config = "workers/api/wrangler.local.json";
function wrangler(args: string[], capture = false) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    {
      encoding: "utf8",
      stdio: capture ? "pipe" : "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (r.status !== 0)
    throw Error("Wrangler failed: " + args.slice(0, 2).join(" "));
  return r.stdout ?? "";
}
const who = wrangler(["whoami"], true);
if (/not authenticated/i.test(who)) {
  console.error(
    "Cloudflare authentication is required. Run: npx wrangler login\nThen rerun npm run setup. No cloud resources were changed.",
  );
  process.exit(1);
}
if (!existsSync(config))
  writeFileSync(config, readFileSync("workers/api/wrangler.jsonc"));
let cfg = JSON.parse(readFileSync(config, "utf8"));
const databases = JSON.parse(wrangler(["d1", "list", "--json"], true));
const existing = databases.find((d: any) => d.name === "dmflow");
if (existing) {
  cfg.d1_databases[0].database_id = existing.uuid;
  writeFileSync(config, JSON.stringify(cfg, null, 2));
} else
  wrangler([
    "d1",
    "create",
    "dmflow",
    "--config",
    config,
    "--binding",
    "DB",
    "--update-config",
  ]);
const queueList = wrangler(["queues", "list"], true);
for (const name of ["dmflow-events", "dmflow-dead"])
  if (!queueList.includes(name)) wrangler(["queues", "create", name]);
wrangler([
  "d1",
  "migrations",
  "apply",
  "dmflow",
  "--remote",
  "--config",
  config,
]);
mkdirSync("work", { recursive: true });
const bootstrap = "work/bootstrap.sql";
writeFileSync(
  bootstrap,
  "INSERT OR IGNORE INTO workspaces VALUES('pilot','Creator studio',30);\nINSERT OR IGNORE INTO owners VALUES('pilot-owner','pilot');\n",
);
wrangler([
  "d1",
  "execute",
  "dmflow",
  "--remote",
  "--config",
  config,
  "--file",
  bootstrap,
]);
if (process.argv.includes("--deploy")) {
  cfg = JSON.parse(readFileSync(config, "utf8"));
  const url = process.env.DMFLOW_WORKER_URL ?? cfg.vars.PUBLIC_WORKER_URL;
  if (!/^https:\/\//.test(url))
    throw Error(
      "Set DMFLOW_WORKER_URL to your final HTTPS workers.dev address before deployment. See docs/CLOUDFLARE_SETUP.md.",
    );
  cfg.vars.PUBLIC_WORKER_URL = new URL(url).origin;
  writeFileSync(config, JSON.stringify(cfg, null, 2));
  wrangler(["deploy", "--config", config, "--keep-vars"]);
  console.log("Deployed. Set Meta secrets as documented, then npm run pair.");
} else
  console.log(
    "Cloudflare resources and schema ready. See docs/CLOUDFLARE_SETUP.md for secrets and deploy.",
  );
