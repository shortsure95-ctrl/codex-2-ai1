/**
 * Moyna Local Desktop Agent
 *
 * Run this on your own PC when you want the hosted AI Studio app to control a
 * real local browser window and, on Windows, optional physical mouse/keyboard
 * actions.
 *
 * Setup:
 *   npm install playwright express cors
 *   npx playwright install chromium
 *
 * Recommended launch:
 *   $env:MOYNA_AGENT_TOKEN="choose-a-token"; node local-agent.js
 *
 * Then paste the same token into Moyna's "Local Bridge Token" field.
 *
 * Browser commands include open/search/click/type/scroll/tabs/media, page
 * readback, text finding, and click-by-visible-text.
 */

import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.MOYNA_AGENT_PORT || 3001);
const AGENT_TOKEN = process.env.MOYNA_AGENT_TOKEN || "";
const USE_SYSTEM_CHROME = process.env.MOYNA_USE_SYSTEM_CHROME === "true";

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-moyna-agent-token"],
}));
app.options("*", cors());
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  if (AGENT_TOKEN && req.get("x-moyna-agent-token") !== AGENT_TOKEN) {
    return res.status(401).json({ error: "Local bridge token mismatch." });
  }
  next();
});

let browser = null;
let context = null;
let page = null;
let lastActionStatus = "Standing by for connection...";
let logsList = [];

function logAndBroadcast(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const formattedLog = {
    id: Math.random().toString(36).slice(2),
    text: `[${timestamp}] ${message}`,
    type,
  };
  console.log(`[${type.toUpperCase()}] ${message}`);
  logsList.push(formattedLog);
  if (logsList.length > 80) logsList.shift();
  lastActionStatus = message;
}

function normalizeUrl(input) {
  let destination = String(input || "https://google.com").trim();
  const lower = destination.toLowerCase();
  if (!destination) return "https://google.com";

  const directMap = {
    youtube: "https://www.youtube.com",
    google: "https://www.google.com",
    facebook: "https://www.facebook.com",
    wikipedia: "https://en.wikipedia.org",
    instagram: "https://www.instagram.com",
    x: "https://x.com",
    twitter: "https://x.com",
    gmail: "https://mail.google.com",
  };

  if (directMap[lower]) return directMap[lower];

  if (destination.startsWith("http://") || destination.startsWith("https://")) {
    return destination;
  }

  if (destination.includes(" ") || !destination.includes(".")) {
    return `https://www.google.com/search?q=${encodeURIComponent(destination)}`;
  }

  return `https://${destination}`;
}

async function ensureBrowser() {
  if (!browser || !browser.isConnected()) {
    logAndBroadcast(`Launching ${USE_SYSTEM_CHROME ? "system Chrome" : "Chromium"} browser...`, "info");
    browser = await chromium.launch({
      headless: false,
      channel: USE_SYSTEM_CHROME ? "chrome" : undefined,
      args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
    });
    browser.on("disconnected", () => {
      browser = null;
      context = null;
      page = null;
      logAndBroadcast("Browser disconnected. Waiting for next command.", "info");
    });
    context = await browser.newContext({ viewport: null });
    page = await context.newPage();
    logAndBroadcast("Real browser window is ready.", "success");
  } else if (!context) {
    context = await browser.newContext({ viewport: null });
    page = await context.newPage();
  } else if (!page || page.isClosed()) {
    page = await context.newPage();
    logAndBroadcast("Opened a fresh active tab.", "info");
  }

  await page.bringToFront().catch(() => {});
}

async function fillFirstVisible(selectors, text) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 1600 });
      await locator.fill(text);
      return true;
    } catch {
      // Try the next selector.
    }
  }
  return false;
}

async function clickSmart(selector, description = "") {
  const trimmed = String(selector || "").trim();
  const desc = String(description || trimmed).trim();

  if (trimmed === "play-button") {
    await page.evaluate(() => document.querySelector("video")?.play());
    return "Played the active media element.";
  }
  if (trimmed === "pause-button") {
    await page.evaluate(() => document.querySelector("video")?.pause());
    return "Paused the active media element.";
  }
  if (trimmed.startsWith("video-")) {
    const videoId = trimmed.replace("video-", "");
    const directUrl = `https://www.youtube.com/watch?v=${videoId}`;
    await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    return `Opened YouTube video ${videoId}.`;
  }
  if (/^(search-result-|result-)\d+$/i.test(trimmed)) {
    const idx = Number(trimmed.replace("search-result-", "").replace("result-", ""));
    const resultLinks = page.locator('a[href^="http"], a[href^="/url?"]');
    await resultLinks.nth(idx).click({ timeout: 4000 });
    return `Clicked search result index ${idx}.`;
  }

  const selectorAttempts = [
    trimmed,
    `[aria-label="${trimmed.replaceAll('"', '\\"')}"]`,
    `text="${trimmed.replaceAll('"', '\\"')}"`,
  ].filter(Boolean);

  for (const attempt of selectorAttempts) {
    try {
      await page.locator(attempt).first().click({ timeout: 2500 });
      return `Clicked selector/text target: ${attempt}.`;
    } catch {
      // Keep trying.
    }
  }

  if (desc) {
    try {
      await page.getByText(desc, { exact: false }).first().click({ timeout: 2500 });
      return `Clicked visible text matching: ${desc}.`;
    } catch {
      // Fall through to YouTube fallback.
    }
  }

  if (page.url().includes("youtube.com")) {
    const firstVideo = page.locator("ytd-video-renderer a#video-title, ytd-rich-grid-media a#video-title").first();
    await firstVideo.click({ timeout: 4000 });
    return "Clicked the first visible YouTube video.";
  }

  throw new Error(`Could not find click target: ${trimmed || desc}`);
}

async function extractPageSnapshot(maxChars = 6000) {
  await ensureBrowser();
  const limit = Math.max(1000, Math.min(Number(maxChars || 6000), 20000));
  return page.evaluate((maxLen) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };

    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter(visible)
      .map((el) => clean(el.textContent))
      .filter(Boolean)
      .slice(0, 30);

    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter(visible)
      .map((el) => ({
        text: clean(el.textContent).slice(0, 140),
        href: el.href,
      }))
      .filter((item) => item.text && item.href)
      .slice(0, 30);

    const main = document.querySelector("main, article, [role='main']") || document.body;
    const text = clean(main?.innerText || document.body.innerText || "").slice(0, maxLen);

    return {
      title: document.title || location.hostname,
      url: location.href,
      headings,
      links,
      text,
    };
  }, limit);
}

function makeSnippet(text, query) {
  const haystack = String(text || "");
  const needle = String(query || "");
  const index = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return null;
  return haystack.slice(Math.max(0, index - 160), Math.min(haystack.length, index + needle.length + 220));
}

async function runPowerShell(script, timeout = 5000) {
  if (process.platform !== "win32") {
    throw new Error("Physical desktop control currently uses Windows PowerShell APIs.");
  }
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, timeout, maxBuffer: 1024 * 1024 }
  );
  if (stderr && stderr.trim()) {
    logAndBroadcast(`PowerShell warning: ${stderr.trim()}`, "info");
  }
  return stdout;
}

function encodePowerShellText(text) {
  return Buffer.from(String(text || ""), "utf8").toString("base64");
}

async function desktopMouseMove(x, y) {
  await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Number(x)}, ${Number(y)})
`);
}

async function desktopClick(button = "left", count = 1) {
  const normalized = String(button || "left").toLowerCase();
  const flags = {
    left: [0x0002, 0x0004],
    right: [0x0008, 0x0010],
    middle: [0x0020, 0x0040],
  }[normalized] || [0x0002, 0x0004];
  const repeats = Math.max(1, Math.min(Number(count || 1), 5));

  await runPowerShell(`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseBridge {
  [DllImport("user32.dll", CharSet=CharSet.Auto, CallingConvention=CallingConvention.StdCall)]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, UIntPtr dwExtraInfo);
}
"@
for ($i = 0; $i -lt ${repeats}; $i++) {
  [MouseBridge]::mouse_event(${flags[0]}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 35
  [MouseBridge]::mouse_event(${flags[1]}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 70
}
`);
}

async function desktopType(text) {
  const encoded = encodePowerShellText(text);
  await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${encoded}"))
Set-Clipboard -Value $text
[System.Windows.Forms.SendKeys]::SendWait("^v")
`);
}

function toSendKeys(keys) {
  const parts = String(keys || "").split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return "";

  const modifiers = [];
  const normals = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") modifiers.push("^");
    else if (lower === "alt") modifiers.push("%");
    else if (lower === "shift") modifiers.push("+");
    else if (lower === "win" || lower === "windows") throw new Error("Win-key hotkeys are not supported by the safe SendKeys bridge.");
    else normals.push(part);
  }

  const keyMap = {
    enter: "{ENTER}",
    escape: "{ESC}",
    esc: "{ESC}",
    tab: "{TAB}",
    backspace: "{BACKSPACE}",
    delete: "{DELETE}",
    space: " ",
    arrowup: "{UP}",
    arrowdown: "{DOWN}",
    arrowleft: "{LEFT}",
    arrowright: "{RIGHT}",
    home: "{HOME}",
    end: "{END}",
    pageup: "{PGUP}",
    pagedown: "{PGDN}",
  };

  const normal = normals.join("+");
  const mapped = keyMap[normal.toLowerCase()] || normal;
  return `${modifiers.join("")}${mapped}`;
}

async function desktopHotkey(keys) {
  const sendKeys = toSendKeys(keys);
  if (!sendKeys) throw new Error("Missing hotkey sequence.");
  const encoded = encodePowerShellText(sendKeys);
  await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
$keys = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${encoded}"))
[System.Windows.Forms.SendKeys]::SendWait($keys)
`);
}

app.get("/api/status", async (req, res) => {
  res.json({
    connected: true,
    authenticated: Boolean(AGENT_TOKEN),
    browserActive: Boolean(browser && browser.isConnected()),
    lastAction: lastActionStatus,
    logs: logsList,
    currentUrl: page && !page.isClosed() ? page.url() : "None",
    tabCount: context ? context.pages().length : 0,
    platform: process.platform,
  });
});

app.post("/api/action", async (req, res) => {
  const { type, args = {} } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: "Missing parameter 'type'." });
  }

  logAndBroadcast(`Invoking directive: ${type}`, "action");

  try {
    if (String(type).startsWith("browser")) {
      await ensureBrowser();
    }

    switch (type) {
      case "browserOpen": {
        const destination = normalizeUrl(args.url);
        logAndBroadcast(`Navigating to ${destination}`, "info");
        await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 30000 });

        if (destination.includes("youtube.com")) {
          try {
            const consentBtn = page.locator('button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("I agree")').first();
            if (await consentBtn.isVisible({ timeout: 1800 })) {
              await consentBtn.click();
            }
          } catch {
            // Cookie dialogs vary by region; ignore if absent.
          }
        }

        logAndBroadcast(`Loaded ${destination}`, "success");
        return res.json({ result: `Opened ${destination}`, currentUrl: page.url() });
      }

      case "browserSearch": {
        const query = String(args.query || "").trim();
        if (!query) throw new Error("Missing search query.");
        const current = page.url().toLowerCase();
        let filled = false;

        if (current.includes("youtube.com")) {
          filled = await fillFirstVisible(['input[id="search"]', 'input[name="search_query"]'], query);
        } else if (current.includes("google.")) {
          filled = await fillFirstVisible(['textarea[name="q"]', 'input[name="q"]'], query);
        } else {
          filled = await fillFirstVisible(['input[type="search"]', 'input[type="text"]', "textarea"], query);
        }

        if (filled) {
          await page.keyboard.press("Enter");
        } else {
          await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded" });
        }

        logAndBroadcast(`Search submitted: ${query}`, "success");
        return res.json({ result: `Searched for ${query}`, currentUrl: page.url() });
      }

      case "browserClick": {
        const result = await clickSmart(args.selector, args.description);
        logAndBroadcast(result, "success");
        return res.json({ result, currentUrl: page.url() });
      }

      case "browserMediaControl": {
        const action = String(args.action || "");
        const val = Number(args.value || 75);
        let responseText = `Media action ${action} completed.`;

        if (action === "play") {
          await page.evaluate(() => document.querySelector("video")?.play());
        } else if (action === "pause") {
          await page.evaluate(() => document.querySelector("video")?.pause());
        } else if (action === "volume") {
          await page.evaluate((pct) => {
            const v = document.querySelector("video");
            if (v) v.volume = Math.max(0, Math.min(1, pct / 100));
          }, val);
          responseText = `Volume set to ${val} percent.`;
        } else if (action === "mute") {
          await page.evaluate(() => {
            const v = document.querySelector("video");
            if (v) v.muted = true;
          });
        } else if (action === "unmute") {
          await page.evaluate(() => {
            const v = document.querySelector("video");
            if (v) v.muted = false;
          });
        } else if (action === "fullscreen") {
          await page.keyboard.press("f");
          responseText = "Fullscreen toggled.";
        } else if (action === "exit_fullscreen") {
          await page.keyboard.press("Escape");
          responseText = "Exited fullscreen.";
        } else if (action === "skip") {
          await page.evaluate(() => {
            const v = document.querySelector("video");
            if (v) v.currentTime += 30;
          });
          responseText = "Skipped forward 30 seconds.";
        } else {
          throw new Error(`Unknown media action: ${action}`);
        }

        logAndBroadcast(responseText, "success");
        return res.json({ result: responseText });
      }

      case "browserScroll": {
        const direction = String(args.direction || "down");
        const amount = Number(args.amount || 450);
        const delta = direction === "up" ? -amount : amount;
        await page.evaluate((yOffset) => window.scrollBy({ top: yOffset, behavior: "smooth" }), delta);
        logAndBroadcast(`Scrolled ${direction} ${amount}px.`, "success");
        return res.json({ result: `Scrolled ${direction} ${amount}px.` });
      }

      case "browserType": {
        const text = String(args.text || "");
        if (!text) throw new Error("Missing text.");
        if (args.selector) {
          await page.locator(String(args.selector)).first().fill(text, { timeout: 3000 });
        } else {
          await page.keyboard.type(text, { delay: 8 });
        }
        logAndBroadcast(`Typed ${text.length} characters.`, "success");
        return res.json({ result: `Typed ${text.length} characters.` });
      }

      case "browserMouseMove": {
        const x = Number(args.x || 0);
        const y = Number(args.y || 0);
        await page.mouse.move(x, y, { steps: 12 });
        if (args.click) {
          await page.mouse.click(x, y);
        }
        const result = `Browser cursor moved to ${x}, ${y}${args.click ? " and clicked" : ""}.`;
        logAndBroadcast(result, "success");
        return res.json({ result });
      }

      case "browserKeyPress": {
        const key = String(args.key || "");
        if (!key) throw new Error("Missing key.");
        await page.keyboard.press(key.replace(/^Ctrl\+/i, "Control+"));
        logAndBroadcast(`Pressed browser key ${key}.`, "success");
        return res.json({ result: `Pressed ${key}.` });
      }

      case "browserReadPage": {
        const snapshot = await extractPageSnapshot(args.maxChars || 6000);
        logAndBroadcast(`Read page "${snapshot.title}" (${snapshot.text.length} chars).`, "success");
        return res.json(snapshot);
      }

      case "browserFindText": {
        const query = String(args.query || "").trim();
        if (!query) throw new Error("Missing text query.");
        const snapshot = await extractPageSnapshot(20000);
        const snippet = makeSnippet(snapshot.text, query);
        const linkMatches = snapshot.links
          .filter((item) => item.text.toLowerCase().includes(query.toLowerCase()) || item.href.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8);
        const result = {
          query,
          found: Boolean(snippet || linkMatches.length),
          snippets: snippet ? [snippet] : [],
          links: linkMatches,
          title: snapshot.title,
          url: snapshot.url,
        };
        logAndBroadcast(`Find text "${query}": ${result.found ? "matched" : "not found"}.`, result.found ? "success" : "info");
        return res.json(result);
      }

      case "browserClickText": {
        const text = String(args.text || "").trim();
        if (!text) throw new Error("Missing visible text.");
        await page.getByText(text, { exact: false }).first().click({ timeout: 5000 });
        const result = `Clicked visible text: ${text}.`;
        logAndBroadcast(result, "success");
        return res.json({ result, currentUrl: page.url() });
      }

      case "browserGoBack": {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
        logAndBroadcast("Browser went back.", "success");
        return res.json({ result: "Went back.", currentUrl: page.url() });
      }

      case "browserTabAction": {
        const action = String(args.action || "");
        if (action === "new") {
          page = await context.newPage();
          await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded" });
          logAndBroadcast(`New tab opened: ${page.url()}`, "success");
        } else if (action === "close") {
          await page.close();
          const pages = context.pages();
          page = pages[Number(args.tabId)] || pages[pages.length - 1] || null;
          if (page) await page.bringToFront();
          logAndBroadcast("Closed active tab.", "success");
        } else if (action === "switch") {
          const pages = context.pages();
          const index = Number(args.tabId ?? args.index ?? 0);
          page = pages[index] || pages[pages.length - 1];
          if (!page) throw new Error("No tabs are available to switch to.");
          await page.bringToFront();
          logAndBroadcast(`Switched to tab ${index}.`, "success");
        } else {
          throw new Error(`Unknown tab action: ${action}`);
        }
        return res.json({ result: `Tab action ${action} completed.`, currentUrl: page ? page.url() : "None" });
      }

      case "desktopMouseMove": {
        await desktopMouseMove(args.x, args.y);
        const result = `Desktop cursor moved to ${Number(args.x)}, ${Number(args.y)}.`;
        logAndBroadcast(result, "success");
        return res.json({ result });
      }

      case "desktopClick": {
        await desktopClick(args.button || "left", args.count || 1);
        const result = `Desktop ${args.button || "left"} click completed.`;
        logAndBroadcast(result, "success");
        return res.json({ result });
      }

      case "desktopType": {
        await desktopType(args.text || "");
        const result = `Desktop typed/pasted ${String(args.text || "").length} characters.`;
        logAndBroadcast(result, "success");
        return res.json({ result });
      }

      case "desktopHotkey": {
        await desktopHotkey(args.keys || "");
        const result = `Desktop hotkey pressed: ${args.keys}.`;
        logAndBroadcast(result, "success");
        return res.json({ result });
      }

      default:
        throw new Error(`Directive '${type}' is not recognized by the local agent.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logAndBroadcast(`Execution error: ${message}`, "error");
    return res.status(500).json({ error: message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log("\n======================================================");
  console.log("Moyna Local Desktop Agent is running");
  console.log(`Listening on: http://127.0.0.1:${PORT}`);
  console.log(`Token protection: ${AGENT_TOKEN ? "enabled" : "disabled"}`);
  console.log("======================================================\n");
});
