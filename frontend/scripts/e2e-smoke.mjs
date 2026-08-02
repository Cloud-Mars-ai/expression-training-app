import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = globalThis.process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const executablePath = globalThis.process.env.E2E_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const resultRoot = resolve("test-results");
await mkdir(resultRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

const findings = [];
try {
  for (const width of [320, 375, 430, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 820 } });
    await context.grantPermissions(["microphone"], { origin: baseUrl });
    const page = await context.newPage();
    collectRuntimeErrors(page, findings, `layout-${width}`);
    await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
    await assertNoHorizontalOverflow(page, `home-${width}`);
    await page.getByRole("link", { name: "训练", exact: true }).click();
    await assertNoHorizontalOverflow(page, `training-${width}`);
    await page.screenshot({ path: resolve(resultRoot, `training-${width}.png`), fullPage: true });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 375, height: 820 } });
  await context.grantPermissions(["microphone"], { origin: baseUrl });
  const page = await context.newPage();
  collectRuntimeErrors(page, findings, "full-flow");
  await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
  await page.evaluate(() => globalThis.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("link", { name: "继续训练" }).click();
  await page.getByRole("link", { name: /选择表达框架/ }).click();
  await page.getByRole("button", { name: /使用 STAR .*语音.*开始准备/ }).click();
  await page.getByRole("button", { name: /提前开始表达/ }).click();
  await completeRecording(page);
  await page.waitForURL(/(\/attempt\/[^/]+\/transcript|\/technical-error\/)/u, { timeout: 20_000 });
  if (page.url().includes("/technical-error/")) {
    await page.getByText("分析没有完成，本次不计分").waitFor();
    await page.screenshot({ path: resolve(resultRoot, "voice-technical-failure.png"), fullPage: true });
  } else {
    await page.getByRole("button", { name: /确认并发送至 DeepSeek/ }).click();
    await page.waitForURL(/\/result\//u, { timeout: 30_000 });
    await page.getByText(/AI 评估置信度/u).waitFor();
    await page.getByText("优先改进").waitFor();
    await assertNoHorizontalOverflow(page, "result-voice-375");
    await page.screenshot({ path: resolve(resultRoot, "voice-flow-complete.png"), fullPage: true });
  }
  await context.close();

  const textContext = await browser.newContext({ viewport: { width: 375, height: 820 } });
  const textPage = await textContext.newPage();
  collectRuntimeErrors(textPage, findings, "text-flow");
  await textPage.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
  await textPage.getByRole("link", { name: "继续训练" }).click();
  await textPage.getByRole("link", { name: /选择表达框架/ }).click();
  await textPage.getByRole("button", { name: "文字输入" }).click();
  await textPage.getByRole("button", { name: /使用 STAR .*文字.*开始准备/ }).click();
  await textPage.getByRole("button", { name: /提前开始表达/ }).click();
  await textPage.getByLabel("写下你的完整回答").fill("我在项目中负责梳理用户反馈，并把问题按影响范围排序。随后我与开发确认可行方案，推动先修复高频问题，最终减少了重复反馈。我的判断是先明确目标，再用行动和结果证明个人贡献。");
  await textPage.getByRole("button", { name: "提交文字回答" }).click();
  await textPage.getByRole("button", { name: "确认提交" }).click();
  await textPage.waitForURL(/\/attempt\/[^/]+\/transcript/u, { timeout: 10_000 });
  await textPage.getByText("文字输入已由用户确认").waitFor();
  await textPage.getByRole("button", { name: /确认并发送至 DeepSeek/ }).click();
  await textPage.waitForURL(/\/result\//u, { timeout: 30_000 });
  await textPage.getByText("语音表现：本模式不可评估").waitFor();
  await assertNoHorizontalOverflow(textPage, "result-text-375");
  await textPage.screenshot({ path: resolve(resultRoot, "text-flow-complete.png"), fullPage: true });
  await textContext.close();
} finally {
  await browser.close();
}

if (findings.length > 0) {
  throw new Error(`Browser acceptance failed:\n${findings.join("\n")}`);
}
globalThis.console.log("Browser acceptance passed for 320, 375, 430 and 1440 widths; voice and text flows passed.");

async function completeRecording(page) {
  await page.getByRole("button", { name: "启用麦克风" }).click();
  await page.getByRole("button", { name: "开始录音" }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "开始录音" }).click();
  await page.waitForTimeout(2_200);
  await page.getByRole("button", { name: "停止录音" }).click();
  await page.getByRole("button", { name: "提交录音并开始分析" }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "提交录音并开始分析" }).click();
  await page.waitForTimeout(500);
  const alert = page.getByRole("alert");
  if (await alert.isVisible().catch(() => false)) throw new Error(`Recording submission failed: ${await alert.innerText()}`);
}

function collectRuntimeErrors(page, target, label) {
  page.on("console", (message) => { if (message.type() === "error") target.push(`${label}: console: ${message.text()}`); });
  page.on("pageerror", (error) => target.push(`${label}: pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "";
    if (errorText.includes("ERR_ABORTED")) return;
    target.push(`${label}: requestfailed: ${request.method()} ${request.url()} ${errorText}`);
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ scrollWidth: globalThis.document.documentElement.scrollWidth, innerWidth: globalThis.window.innerWidth }));
  if (dimensions.scrollWidth > dimensions.innerWidth + 1) findings.push(`${label}: horizontal overflow ${dimensions.scrollWidth} > ${dimensions.innerWidth}`);
}
