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
  fs.mkdtempSync(path.join(os.tmpdir(), "yana-studio-ui-")),
);
const root = path.join(fixture, "Workspace");
const data = path.join(fixture, "state");
fs.mkdirSync(root);
fs.mkdirSync(data);
fs.writeFileSync(path.join(root, "hello.js"), 'const message = "Xin chào";\n');
execFileSync("git", ["init", "-q", root]);
let requests = [];
const server = http.createServer((request, response) => {
  if (request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "studio-test" }] }));
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    requests.push(JSON.parse(body));
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const text = body.includes("WAIT_FOR_CANCEL")
      ? "Waiting "
      : "Xin chào từ runtime thật. ";
    let count = 0;
    const timer = setInterval(() => {
      response.write(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`,
      );
      count++;
      if (!body.includes("WAIT_FOR_CANCEL") && count === 2) {
        clearInterval(timer);
        response.end("data: [DONE]\n\n");
      }
    }, 80);
    response.on("close", () => clearInterval(timer));
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
fs.writeFileSync(
  path.join(data, "workspace-v1.json"),
  JSON.stringify({
    schema: 1,
    projects: [{ name: "Workspace", root }],
    chats: [
      {
        id: "usage-fixture",
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
        usageHistory: [
          {
            input: 100,
            output: 25,
            provider: "custom",
            model: "studio-test",
            recordedAt: "2026-09-08T12:00:00.000Z",
          },
        ],
      },
    ],
    profile: {
      provider: "custom",
      model: "studio-test",
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    },
    layout: { sidebar: 250, inspector: 330, dock: 280 },
    runtime,
  }),
);
let application;
const closeApplication = async () => {
  if (!application) return;
  const running = application;
  const child = running.process();
  await running.evaluate(({ app }) => {
    app.quit();
  });
  await expect.poll(() => child.exitCode, { timeout: 10000 }).toBe(0);
  application = null;
};
const launch = async (readySelector = ".app") => {
  application = await electron.launch({
    args: [appRoot],
    env: { ...process.env, YANA_STUDIO_TEST_DATA: data },
  });
  const page = await application.firstWindow();
  await page.waitForSelector(readySelector);
  return page;
};
try {
  let page = await launch();
  const failures = [];
  await page.evaluate(() => {
    window.__studioTestOutput = "";
    window.studio.on("terminal:data", (event) => {
      window.__studioTestOutput = (
        window.__studioTestOutput + event.data
      ).slice(-10000);
    });
  });
  page.on("pageerror", (error) => failures.push(error.message));
  await expect(page.locator(".title-brand")).toContainText("Yana Studio");
  const showTerminal = page.getByRole("button", { name: "Hiện terminal" });
  if (await showTerminal.isVisible()) await showTerminal.click();
  await page.getByRole("button", { name: "New terminal", exact: true }).click();
  await expect(page.locator(".terminal-pane:visible")).toHaveCount(1);
  const first = await page
    .locator(".terminal-pane:visible")
    .getAttribute("data-terminal");
  await page.locator(".terminal-pane:visible textarea").focus();
  await page.keyboard.type(
    process.platform === "win32"
      ? "echo STUDIO_TAB_ONE"
      : "printf '\\nSTUDIO_TAB_ONE\\n'",
    { delay: 5 },
  );
  await page.keyboard.press("Enter");
  if (process.platform !== "win32") {
    await page.keyboard.type("printf '");
    await page.keyboard.insertText("Tiếng Việt 안녕 🐰");
    await page.keyboard.type("' > unicode.txt");
    await page.keyboard.press("Enter");
    await expect
      .poll(
        () =>
          fs.existsSync(path.join(root, "unicode.txt")) &&
          fs.readFileSync(path.join(root, "unicode.txt"), "utf8"),
      )
      .toBe("Tiếng Việt 안녕 🐰");
    await page.keyboard.type("printf 'HISTORY_OK\\n' >> history.txt");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect
      .poll(
        () =>
          fs.existsSync(path.join(root, "history.txt")) &&
          fs.readFileSync(path.join(root, "history.txt"), "utf8"),
      )
      .toBe("HISTORY_OK\nHISTORY_OK\n");
    await page.keyboard.type(
      "sh -c 'echo $$ > sleep-started.txt; exec sleep 30'",
    );
    await page.keyboard.press("Enter");
    await expect
      .poll(() => fs.existsSync(path.join(root, "sleep-started.txt")))
      .toBe(true);
    await expect
      .poll(() => {
        const child = fs
          .readFileSync(path.join(root, "sleep-started.txt"), "utf8")
          .trim();
        return execFileSync("ps", ["-p", child, "-o", "comm="], {
          encoding: "utf8",
        }).trim();
      })
      .toMatch(/sleep$/);
    await page.evaluate(() => {
      window.__studioTestOutput = "";
    });
    await page.keyboard.press("Control+c");
    await expect
      .poll(() =>
        page.evaluate(() => window.__studioTestOutput.includes("\x1b[?2004h")),
      )
      .toBe(true);
    await page.keyboard.type("printf 'INTERRUPTED' > interrupted.txt");
    await page.keyboard.press("Enter");
    await expect
      .poll(
        () =>
          fs.existsSync(path.join(root, "interrupted.txt")) &&
          fs.readFileSync(path.join(root, "interrupted.txt"), "utf8"),
      )
      .toBe("INTERRUPTED");
  }
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+f" : "Control+f",
  );
  await expect(
    page.getByRole("textbox", { name: "Find in terminal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close terminal search" }).click();
  await page.getByRole("button", { name: "New terminal", exact: true }).click();
  await expect(page.locator(".terminal-pane")).toHaveCount(2);
  const second = await page
    .locator(".terminal-pane:visible")
    .getAttribute("data-terminal");
  expect(first).not.toBe(second);
  await page.getByRole("button", { name: "Terminal 1", exact: true }).click();
  await expect(page.locator(".terminal-pane:visible")).toHaveAttribute(
    "data-terminal",
    first,
  );
  const element = await page
    .locator(".terminal-pane:visible .xterm")
    .elementHandle();
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Cài đặt", exact: true })
    .click();
  await expect(page.locator(".terminal-pane:visible")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Tài khoản local-first" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Model & Runtime", exact: true })
    .click();
  await expect(page.getByText(/19 provider chính thức/)).toBeVisible();
  await page.getByLabel("API key").fill("UI_TEST_SECRET_NEVER_PLAINTEXT");
  await page.getByRole("button", { name: "Lưu và sử dụng" }).click();
  await expect(page.getByText(/Credential OpenAI-compatible/)).toBeVisible();
  const credentialDirectory = path.join(data, "model-credentials-v1");
  const persistedFiles = [
    path.join(data, "workspace-v1.json"),
    ...(fs.existsSync(credentialDirectory)
      ? fs
          .readdirSync(credentialDirectory)
          .map((name) => path.join(credentialDirectory, name))
      : []),
  ];
  for (const file of persistedFiles)
    expect(fs.readFileSync(file).toString()).not.toContain(
      "UI_TEST_SECRET_NEVER_PLAINTEXT",
    );
  await page.getByRole("button", { name: "Sử dụng", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sử dụng token" }),
  ).toBeVisible();
  await expect(page.getByText("125", { exact: true })).toHaveCount(3);
  await expect(
    page.locator(".usage-model-row").getByText("studio-test", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tài khoản & Kết nối", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Google Account/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Gmail/ })).toBeVisible();
  await page.getByRole("button", { name: "Quyền hạn", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Capability registry" }),
  ).toBeVisible();
  await expect(
    page.getByText("command.execute", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Needs approval", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Công cụ ngoài", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Remote & external tools" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "MCP" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "External coding tools" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lệnh Yana", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Command reference" }),
  ).toBeVisible();
  await page.getByPlaceholder("Filter commands…").fill("doctor --fix");
  await expect(
    page.getByText("yana-ai doctor --fix", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Giao diện & Ngôn ngữ", exact: true })
    .click();
  await page.getByLabel("Ngôn ngữ hiển thị").selectOption("ko");
  await expect(
    page.getByRole("heading", { name: "Yana Studio 설정" }),
  ).toBeVisible();
  await page.getByLabel("표시 언어").selectOption("vi");
  await expect(
    page.getByRole("heading", { name: "Cài đặt Yana Studio" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Riêng tư & Dữ liệu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Local data overview" }),
  ).toBeVisible();
  await expect(page.getByText(/Credentials & sessions/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xuất backup", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Thả file backup vào đây")).toBeVisible();
  await expect(page.getByText("Trước khi gỡ ứng dụng")).toBeVisible();
  const exposed = await page.evaluate(() => Object.keys(window.studio));
  expect(exposed).not.toContain("accessToken");
  expect(exposed).not.toContain("getConnectorCredential");
  await page
    .locator(".settings-page")
    .getByRole("button", { name: "Workspace", exact: true })
    .click();
  await page.getByRole("tab", { name: "AI Models" }).click();
  await expect(page.getByText("Key đã mã hóa")).toBeVisible();
  await expect(page.getByLabel("Provider")).toBeVisible();
  expect(await element.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator(".terminal-pane:visible")).toHaveAttribute(
    "data-terminal",
    first,
  );
  await page.getByRole("button", { name: "Split terminals" }).click();
  await expect(page.locator(".terminal-pane:visible")).toHaveCount(2);
  await page.getByRole("button", { name: "Split terminals" }).click();
  await page.getByRole("button", { name: "New terminal", exact: true }).click();
  await page.getByRole("button", { name: "Tile all terminals" }).click();
  await expect(page.locator(".terminal-pane:visible")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Focus Terminal 1", exact: true })
    .click();
  await expect(page.locator(".terminal-pane.focused")).toHaveAttribute(
    "data-terminal",
    first,
  );
  await page.getByRole("button", { name: "Tile all terminals" }).click();
  await page.locator("nav").getByRole("button", { name: "Trò chuyện" }).click();
  await expect(
    page.getByRole("button", { name: "Thêm file làm ngữ cảnh" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mở Tệp và Trình sửa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hiện Terminal" }),
  ).toBeVisible();
  await expect(page.locator(".terminal-dock")).toHaveClass(/ambient/);
  await page.getByRole("button", { name: "Có kiểm soát" }).click();
  const governance = page.getByRole("dialog", { name: "Quyền của phiên" });
  await expect(governance).toBeVisible();
  await expect(governance).toContainText("repo.read");
  await expect(governance).toContainText("command.execute");
  await expect(governance).toContainText("Hỏi mỗi lần");
  await governance
    .getByRole("button", { name: "Đóng quyền của phiên" })
    .click();
  await page.getByRole("button", { name: "Có kiểm soát" }).click();
  await governance.getByRole("button", { name: "Quản lý quyền" }).click();
  await expect(
    page.getByText("PENDING APPROVALS", { exact: true }),
  ).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Trò chuyện" }).click();
  const separator = page.getByRole("separator", {
    name: "Resize terminal dock",
  });
  const box = await separator.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y - 80, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        JSON.parse(
          fs.readFileSync(path.join(data, "workspace-v1.json"), "utf8"),
        ).layout.dock,
    )
    .toBeGreaterThan(320);
  await page
    .getByRole("button", { name: "Tệp & Trình sửa", exact: true })
    .click();
  await page.getByRole("button", { name: "hello.js", exact: true }).click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+End" : "Control+End",
  );
  await page.keyboard.insertText("// Studio editor works\n");
  await page.getByRole("button", { name: /Lưu/ }).click();
  expect(fs.readFileSync(path.join(root, "hello.js"), "utf8")).toContain(
    "Studio editor works",
  );
  await page.locator("nav").getByRole("button", { name: "Trò chuyện" }).click();
  await page
    .getByRole("button", { name: "Đính kèm file code đang mở" })
    .click();
  await expect(page.locator(".attachment-chip")).toContainText("hello.js");
  const composer = page.getByRole("textbox", { name: "Message to Yana" });
  await composer.fill("Xin chào. Đây là integration test.");
  await composer.press("Enter");
  await expect(page.locator(".message.assistant .message-body")).toContainText(
    "Xin chào từ runtime thật.",
    { timeout: 15000 },
  );
  await expect(
    page.getByRole("button", { name: "Dừng", exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  expect(requests.length).toBe(1);
  const firstUserMessage = page.locator(".message.user").first();
  await firstUserMessage
    .getByRole("button", { name: "Dùng lại nội dung trong ô nhập" })
    .click();
  await expect(composer).toHaveValue("Xin chào. Đây là integration test.");
  await composer.fill("Còn nhớ câu trước không?");
  await composer.press("Enter");
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Dừng", exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  expect(
    requests.at(-1).messages.filter((message) => message.role === "user")
      .length,
  ).toBe(2);
  await composer.fill("WAIT_FOR_CANCEL");
  await composer.press("Enter");
  await page.getByRole("button", { name: "Dừng", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Dừng", exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  await page.getByRole("tab", { name: "Inspector" }).click();
  await expect(page.getByText("PHIÊN HIỆN TẠI")).toBeVisible();
  await expect(page.locator(".session-summary-grid")).toContainText(
    "studio-test",
  );
  expect(failures).toEqual([]);
  fs.mkdirSync(path.join(appRoot, "artifacts"), { recursive: true });
  await page.screenshot({
    path: path.join(appRoot, "artifacts/studio-integration.png"),
  });
  await closeApplication();
  application = null;
  page = await launch();
  await page.locator("nav").getByRole("button", { name: "Trò chuyện" }).click();
  await expect(page.locator(".message.user")).toHaveCount(3);
  await expect(page.locator(".terminal-pane")).toHaveCount(0);
  await expect(page.locator(".message.assistant").first()).toContainText(
    "Xin chào từ runtime thật.",
  );
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Cài đặt", exact: true })
    .click();
  await page.getByLabel("Tên hiển thị").fill("Local User");
  await page.getByLabel("Email").fill("local-user@example.test");
  await page.getByLabel("Mật khẩu").fill("studio-password-2026");
  await page.getByRole("button", { name: "Tạo hồ sơ local" }).click();
  await page.getByRole("button", { name: "Khóa Studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Yana Studio đã khóa" }),
  ).toBeVisible();
  await page.getByLabel("Mật khẩu").fill("studio-password-2026");
  await page.getByRole("button", { name: "Mở khóa" }).click();
  await expect(page.locator(".app")).toBeVisible();
  await closeApplication();
  application = null;
  page = await launch(".account-lock");
  await expect(
    page.getByRole("heading", { name: "Yana Studio đã khóa" }),
  ).toBeVisible();
  await page.getByLabel("Mật khẩu").fill("studio-password-2026");
  await page.getByRole("button", { name: "Mở khóa" }).click();
  await expect(page.locator(".app")).toBeVisible();
  await expect(page.locator(".recent")).toContainText("Workspace");
  console.log(
    "PASS Electron UI + actual Rust runtime: tab identity, Settings survival, split, resize persistence, file edit/save, streaming, message reuse, history, stop, reopen, local account lock and unlock. Provider is an explicit local test stub, not a real model.",
  );
} catch (error) {
  if (application) {
    const failedPage = await application.firstWindow();
    fs.mkdirSync(path.join(appRoot, "artifacts"), { recursive: true });
    await failedPage.screenshot({
      path: path.join(appRoot, "artifacts/studio-failure.png"),
    });
    console.error(
      "Terminal fixture output:",
      await failedPage.evaluate(() => window.__studioTestOutput),
    );
  }
  throw error;
} finally {
  if (application) await closeApplication();
  server.closeAllConnections();
  server.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}
