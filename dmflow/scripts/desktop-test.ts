import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync("work", { recursive: true });
mkdirSync("artifacts", { recursive: true });
const data = mkdtempSync(resolve("work/desktop-test-"));
// Launch a separate test instance with disposable demo data. Never drive the user's session.
const executablePath = process.env.DMFLOW_TEST_EXECUTABLE;
const launch = () =>
  electron.launch({
    ...(executablePath
      ? { executablePath, args: [] }
      : { args: ["apps/desktop"] }),
    env: { ...process.env, DMFLOW_DATA_DIR: data },
    timeout: 30000,
  });
let app = await launch();
try {
  const page = await app.firstWindow();
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.getByText("5.54", { exact: false }).first().waitFor();
  await page.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
  await page
    .getByRole("button", { name: "Create campaign", exact: true })
    .click();
  await page.getByLabel("Choose a Reel or post").selectOption("media-1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Keyword and optional aliases").fill("BLUEPRINT");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Resource destination")
    .fill("https://example.com/blueprint");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Campaign name").fill("Desktop acceptance");
  await page.getByRole("button", { name: "Turn campaign on" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Try it out" }).click();
  await page.getByLabel("What do they say?").fill("BLUEPRINT");
  await page
    .getByRole("button", { name: "Simulate event", exact: true })
    .click();
  await page
    .getByText("Your keyword matched. One resource message was sent.")
    .waitFor();
  const url = await page.getByLabel("Tracked resource link").inputValue();
  const redirect = await page.request.get(url, { maxRedirects: 0 });
  assert.equal(redirect.status(), 302);
  await page.getByRole("button", { name: "Simulate follow-up DM" }).click();
  await page
    .getByRole("dialog")
    .getByText("No campaign keyword matched", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Try it out" }).click();
  await page.getByLabel("Person", { exact: true }).fill("typo.visitor");
  await page.getByLabel("What do they say?").fill("roamdap");
  await page
    .getByRole("button", { name: "Simulate event", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Your keyword matched. One resource message was sent.")
    .waitFor();
  await page.getByLabel("Person", { exact: true }).fill("excluded.visitor");
  await page.getByLabel("What do they say?").fill("don't send roadmap");
  await page
    .getByRole("button", { name: "Simulate event", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Excluded phrase — no message sent")
    .waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Engaged", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search people" })
    .fill("new.visitor");
  await page
    .getByRole("button", { name: "@new.visitor", exact: true })
    .waitFor();
  await page.screenshot({ path: "artifacts/people.png", fullPage: true });
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page.getByText("Your next chapter starts with a roadmap.").waitFor();
  await page.screenshot({ path: "artifacts/media.png", fullPage: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Estimated manual response time (seconds)").fill("45");
  await page.getByRole("button", { name: "Save estimate" }).click();
  await page.getByText("Time estimate updated", { exact: true }).waitFor();
  assert.deepEqual(failures, []);
  await app.close();
  app = await launch();
  const second = await app.firstWindow();
  await second.getByText("Demo workspace", { exact: true }).waitFor();
  await second.getByRole("button", { name: /^Campaigns/ }).click();
  await second.getByRole("heading", { name: "Desktop acceptance" }).waitFor();
  await second.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(
    await second
      .getByLabel("Estimated manual response time (seconds)")
      .inputValue(),
    "45",
  );
  console.log(
    "Desktop acceptance passed: campaign, match, typo, exclusion, send, real redirect, engagement, navigation, settings and restart persistence.",
  );
} catch (error) {
  const page = await app.firstWindow();
  await page.screenshot({
    path: "artifacts/acceptance-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await app.close();
}
