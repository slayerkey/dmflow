import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { startDemo } from "../packages/core/src/server";
mkdirSync("work", { recursive: true });
const server = await startDemo(
  "work/cli-demo.sqlite",
  readFileSync("migrations/0001_initial.sql", "utf8"),
);
writeFileSync(
  "work/demo-session.json",
  JSON.stringify({ url: server.url, token: server.token }),
  { mode: 0o600 },
);
console.log(
  "Demo API ready at " +
    server.url +
    ". Run simulation commands in another terminal.",
);
process.on(
  "SIGINT",
  () =>
    void server.close().then(() => {
      unlinkSync("work/demo-session.json");
      process.exit(0);
    }),
);
