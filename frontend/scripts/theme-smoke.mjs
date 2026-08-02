import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const executablePath = process.env.E2E_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const resultRoot = resolve("test-results");
await mkdir(resultRoot, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 820 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: resolve(resultRoot, "theme-home-light.png"), fullPage: true });
  await page.getByRole("button", { name: /切换到淡黄色莫兰迪主题/ }).click();
  await page.screenshot({ path: resolve(resultRoot, "theme-home-morandi.png"), fullPage: true });

  await page.getByRole("link", { name: "继续训练" }).click();
  await page.getByRole("link", { name: /选择表达框架/ }).click();
  await page.getByRole("button", { name: /使用 STAR，开始准备/ }).click();
  await page.screenshot({ path: resolve(resultRoot, "theme-focus-morandi.png"), fullPage: true });
  await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /切换到白色浅色主题/ }).click();
  await page.goBack({ waitUntil: "networkidle" });
  await page.screenshot({ path: resolve(resultRoot, "theme-focus-light.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
}

console.log("Theme screenshots generated.");
/* global process, localStorage, console */
