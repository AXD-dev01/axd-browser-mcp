/**
 * cdp.js — Pure Chrome DevTools Protocol engine over native WebSocket.
 * Zero Puppeteer. Zero Playwright. Direct sub-millisecond execution.
 */

const { spawn } = require("child_process");
const { generateCurve, randomJitter } = require("./humanize");
const path = require("path");
const fs = require("fs");
const http = require("http");

// Use Node.js native WebSocket (standard in Node 22+)
const WS = typeof WebSocket !== "undefined" ? WebSocket : globalThis.WebSocket;

class BrowserSession {
  constructor(opts = {}) {
    this.opts = opts;
    this.port = opts.port || null;
    this.chrome = null;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
    this.cursor = { x: 100, y: 100 };
  }

  async init() {
    if (!this.port) {
      const userDataDir = this.opts.userDataDir || path.join(process.env.HOME, ".axd-mcp-chrome");
      if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

      this.port = 9222;
      const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      const flags = [
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${userDataDir}`,
        "--window-size=1280,800",
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check"
      ];
      if (this.opts.headless !== false) {
        flags.push("--headless=new");
      }

      this.chrome = spawn(chromeBin, flags, { detached: true, stdio: "ignore" });
      this.chrome.unref();
    }

    let target = null;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/json`);
        const targets = await r.json();
        target = targets.find(t => t.type === "page");
        if (target) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 150));
    }

    if (!target) throw new Error("No page target available on CDP port " + this.port);

    this.ws = new WS(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      this.ws.on("open", res);
      this.ws.on("error", rej);
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        if (this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (_) {}
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expr) {
    const res = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await new Promise(r => setTimeout(r, 2000));
    return {
      title: await this.evaluate("document.title"),
      url: await this.evaluate("window.location.href")
    };
  }

  async click(selector) {
    const box = await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()
    `);

    if (!box) throw new Error("Element not found: " + selector);

    const targetPos = { x: Math.round(box.x), y: Math.round(box.y) };
    const pathPoints = generateCurve(this.cursor, targetPos, 15);

    for (const pt of pathPoints) {
      await this.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: pt.x,
        y: pt.y
      });
      await new Promise(r => setTimeout(r, 10));
    }
    this.cursor = targetPos;

    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      x: targetPos.x,
      y: targetPos.y
    });
    await new Promise(r => setTimeout(r, randomJitter(30, 70)));
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      x: targetPos.x,
      y: targetPos.y
    });

    return { clicked: true, target: selector, position: targetPos };
  }

  async type(selector, text) {
    await this.click(selector);
    for (const char of text) {
      await this.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        text: char
      });
      await this.send("Input.dispatchKeyEvent", {
        type: "keyUp"
      });
      await new Promise(r => setTimeout(r, randomJitter(50, 130)));
    }
    return { typed: true, length: text.length };
  }

  async extractContent() {
    return await this.evaluate(`
      (() => {
        return {
          title: document.title,
          url: window.location.href,
          text: document.body ? document.body.innerText.slice(0, 15000) : ""
        };
      })()
    `);
  }

  async close() {
    if (this.ws) this.ws.close();
    if (this.chrome) await this.chrome.kill();
  }
}

module.exports = { BrowserSession };
