import { chromium } from "playwright";
import fs from "node:fs";

const token = fs.readFileSync("/tmp/vis_token.txt", "utf-8").trim();
const outDir = "scratch_screens";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
await context.addCookies([
  {
    name: "hospital-auth-token",
    value: token,
    domain: "localhost",
    path: "/",
  },
]);

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto("http://localhost:3000/wards/ward-3", { waitUntil: "networkidle" });
await page.waitForSelector("text=Patient Queue", { timeout: 20000 });
await page.waitForTimeout(1500); // let the queueReason data settle in

await page.screenshot({ path: `${outDir}/desktop.png`, fullPage: false });

// Crop to the queue column area for a closer look
const queueHeading = page.locator("h2:has-text('Queue')").first();
await queueHeading.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outDir}/desktop_queue.png` });

// Now test narrow mobile viewport
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/mobile.png`, fullPage: true });

console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors));

await browser.close();
