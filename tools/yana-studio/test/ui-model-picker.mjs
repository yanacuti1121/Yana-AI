// Focused real-Electron E2E test for the new composer model picker
// (renderer/ChatModelPicker.tsx). Deliberately standalone rather than
// appended to test/ui.mjs: that script's later Terminal-dock-resize step
// (test/ui.mjs ~line 465, "Resize terminal dock" separator) was already
// broken before this feature existed -- a genuine pre-existing bug (the
// dock gets closed by an earlier Settings visit and nothing reopens it
// before the resize step), unrelated to this feature and out of scope
// here. Two other pre-existing stale-selector breaks in that same file
// (a renamed "Model & Runtime" -> "Mô hình & Điều phối" settings tab, a
// renamed "Giao diện & Ngôn ngữ" -> "Giao diện" settings tab, and a
// "Quyền hạn" label now ambiguous between the main nav and a Settings
// tab sharing the same translated text) were fixed in test/ui.mjs directly
// since they were one-line, unambiguous corrections. This script reuses
// test/ui.mjs's own fixture-setup pattern (fake OpenAI-compatible SSE
// server, workspace-v1.json, account-v1.json) but skips straight to the
// chat surface, avoiding that unrelated rot entirely.
import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixture = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "yana-studio-model-picker-ui-")),
);
const root = path.join(fixture, "Workspace");
const data = path.join(fixture, "state");
fs.mkdirSync(root);
fs.mkdirSync(data);
execFileSync("git", ["init", "-q", root]);

const server = http.createServer((request, response) => {
  if (request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "studio-test" }] }));
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Xin chào từ runtime thật." }, finish_reason: null }] })}\n\n`,
    );
    response.end("data: [DONE]\n\n");
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const runtime =
  process.env.YANA_STUDIO_TEST_RUNTIME ||
  path.join(
    appRoot,
    "runtime",
    process.platform === "win32" ? "yana-rt.exe" : "yana-rt",
  );
const workspaceFile = path.join(data, "workspace-v1.json");
fs.writeFileSync(
  workspaceFile,
  JSON.stringify({
    schema: 1,
    projects: [{ name: "Workspace", root }],
    chats: [
      {
        id: "picker-fixture",
        root,
        title: "New conversation",
        messages: [],
        events: [],
        running: false,
        error: "",
        approval: null,
        profile: {
          provider: "custom",
          model: "studio-test",
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        },
      },
    ],
    profile: {
      provider: "custom",
      model: "studio-test",
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    },
    layout: { sidebar: 250, inspector: 330, dock: 280 },
    runtime,
    onboardingCompleted: true,
  }),
);
fs.mkdirSync(path.join(data, "account-v1"));
fs.writeFileSync(
  path.join(data, "account-v1", "account-v1.json"),
  JSON.stringify({
    schema: 1,
    mode: "google",
    accountId: "picker-ui-test-google-user",
    email: "picker-ui-test@example.test",
    displayName: "Picker Test User",
    createdAt: Date.now(),
  }),
);

const globalProfile = () => JSON.parse(fs.readFileSync(workspaceFile, "utf8")).profile;

let application;
try {
  application = await electron.launch({
    args: [appRoot],
    env: { ...process.env, YANA_STUDIO_TEST_DATA: data },
  });
  const page = await application.firstWindow();
  await page.waitForSelector(".app");
  await page.locator("nav").getByRole("button", { name: "Trò chuyện" }).click();
  const composer = page.getByRole("textbox", { name: "Message to Yana" });
  await expect(composer).toBeVisible();

  const globalProfileBefore = globalProfile();
  const modelPicker = page.locator(".chat-model-picker");
  const triggerButton = modelPicker.locator(".composer-model-button");

  // Trigger shows the fixture's current model before any interaction.
  await expect(triggerButton).toContainText("studio-test");

  // Keyboard-only open (Enter on the focused trigger), search filtering,
  // and an empty-result state -- all real, all from this session's spec.
  await triggerButton.focus();
  await page.keyboard.press("Enter");
  const popover = page.locator(".chat-model-popover");
  await expect(popover).toBeVisible();
  const modelSearch = popover.getByPlaceholder(
    "Tìm model theo tên, provider hoặc khả năng (vision, reasoning, cheap...)",
  );
  await expect(modelSearch).toBeFocused();
  await modelSearch.fill("no-such-model-zzz");
  await expect(popover.getByText("Không tìm thấy model phù hợp")).toBeVisible();

  // A real, always-ready (requiresKey: false) local provider from the
  // shared catalog -- deterministic across environments without needing
  // any provider actually configured/reachable.
  await modelSearch.fill("Llama 3.2");
  const ollamaOption = popover.locator(".chat-model-option", {
    hasText: "Llama 3.2",
  });
  await expect(ollamaOption).toBeVisible();
  await ollamaOption.click();
  await expect(popover).toBeHidden();
  await expect(triggerButton).toContainText("llama3.2");

  // Core architectural guarantee: picking a model here must never touch
  // the app-wide default (workspace-v1.json's top-level `profile`, only
  // ever written by saveProfile/ModelManager -- this picker never calls it).
  expect(globalProfile()).toEqual(globalProfileBefore);

  // Send with the override active. ollama has no local daemon running in
  // this environment, so the turn fails fast over a real network call --
  // that failure is itself the proof the override actually reached
  // sendChat -> profileInput -> launchTurn -> the real yana-rt process
  // (a mocked "success" response would not tell us which provider the
  // runtime was actually invoked with).
  await composer.fill("Kiểm tra model picker riêng cho chat này");
  await composer.press("Enter");
  await expect(page.locator(".message-error-card")).toContainText(
    "Provider: ollama",
    { timeout: 15000 },
  );
  await expect(page.locator(".turn-status")).toContainText("ollama");

  // Global default still untouched after a real send with the override.
  expect(globalProfile()).toEqual(globalProfileBefore);

  // The per-chat override is one-shot: chat.profile now truthfully shows
  // ollama (that's what actually just answered, per chat-turns.test.cjs's
  // and main.cjs's own contract), so the picker now reflects that as the
  // chat's own current state -- but the *pending override* itself is spent.
  // A brand-new chat has no profile of its own (host/main.cjs's newChat
  // handler), so it must fall back to the untouched global default, not
  // leak the previous chat's override.
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(triggerButton).toContainText(globalProfileBefore.model);

  // Keyboard close: Escape closes the popover without selecting anything.
  await triggerButton.click();
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();

  console.log(
    "PASS ChatModelPicker: search/filter/empty-state, real per-chat override reaching a real yana-rt process, global default never mutated, keyboard open/close.",
  );
} catch (error) {
  if (application) {
    const failedPage = await application.firstWindow();
    fs.mkdirSync(path.join(appRoot, "artifacts"), { recursive: true });
    await failedPage.screenshot({
      path: path.join(appRoot, "artifacts/model-picker-failure.png"),
    });
  }
  throw error;
} finally {
  if (application) {
    const child = application.process();
    await application.evaluate(({ app }) => app.quit());
    await expect.poll(() => child.exitCode, { timeout: 10000 }).toBe(0);
  }
  server.closeAllConnections();
  server.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}
