import { readFileSync } from "node:fs";
const args = process.argv.slice(2),
  kind = args[0];
const option = (name: string, fallback: string) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : fallback;
};
let config;
try {
  config = JSON.parse(readFileSync("work/demo-session.json", "utf8"));
} catch {
  throw Error(
    "Start npm run demo:server first. CLI simulations use an isolated demo database.",
  );
}
const request = async (path: string, body?: unknown) => {
  const r = await fetch(config.url + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + config.token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json()) as any;
  if (!r.ok) throw Error(data.error);
  return data;
};
if (kind === "click") {
  const people = await request("/api/people?filter=Messaged");
  const person = await request(
    "/api/people/" + option("person", people.items[0]?.id),
  );
  const token = person.messages[0]?.token;
  if (!token)
    throw Error("No message found. Simulate a matching comment first.");
  const r = await fetch(config.url + "/r/" + token, { redirect: "manual" });
  console.log({ status: r.status, destination: r.headers.get("location") });
} else
  console.log(
    await request("/api/simulate", {
      kind,
      text: option("text", "ROADMAP"),
      personProviderId: option("person", "cli-" + Date.now()),
      username: option("username", "cli.visitor"),
      mediaId: option("media", "media-1"),
      blocked: args.includes("--blocked"),
      failure: option("failure", "none"),
    }),
  );
