/**
 * cdp.js — Pure Chrome DevTools Protocol engine.
 * Zero external dependencies. Uses Node.js native WebSocket & HTTP.
 */

const { spawn } = require("child_process");
const { generateCurve, randomJitter } = require("./humanize");
const { STEALTH_SCRIPT } = require("./stealth");
const path = require("path");
const fs = require("fs");
const net = require("net");
const os = require("os");

const WS = typeof WebSocket !== "undefined" ? WebSocket : globalThis.WebSocket;

function findChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const platform = os.platform();
  const candidates = [];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    );
  } else if (platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium"
    );
  } else if (platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
    );
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("Could not locate Google Chrome binary. Please install Google Chrome or set CHROME_PATH.");
}

function getAvailablePort(startPort = 9222) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(startPort, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", () => {
      // Try next port
      resolve(getAvailablePort(startPort + 1));
    });
  });
}

class BrowserSession {
  constructor(opts = {}) {
    this.opts = opts;
    this.port = opts.port || null;
    this.chrome = null;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
    this.cursor = { x: 100, y: 100 };
    this.targetId = null;
  }

  async init() {
    if (!this.port) {
      this.port = await getAvailablePort(9222);
      const userDataDir = this.opts.userDataDir || path.join(os.homedir(), ".axd-mcp-chrome");
      if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

      const chromeBin = findChromePath();
      const flags = [
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${userDataDir}`,
        "--window-size=1280,800",
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check"
      ];

      if (this.opts.headless !== false && !process.env.AXD_HEADED) {
        flags.push("--headless=new");
      }

      this.chrome = spawn(chromeBin, flags, { detached: true, stdio: "ignore" });
      this.chrome.unref();
    }

    let target = null;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/json`);
        const targets = await r.json();
        target = targets.find(t => t.type === "page");
        if (target) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 150));
    }

    if (!target) throw new Error("No page target available on CDP port " + this.port);
    this.targetId = target.id;

    this.ws = new WS(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (_) {}
    };

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");

    // Inject stealth masking script on every page load
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: STEALTH_SCRIPT
    });
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

  async navigate(url, waitMs = 3000) {
    await this.send("Page.navigate", { url });
    await new Promise(r => setTimeout(r, waitMs));
    return {
      title: await this.evaluate("document.title"),
      url: await this.evaluate("window.location.href"),
      status: "loaded"
    };
  }

  async click(selector) {
    const box = await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()
    `);

    if (!box) throw new Error("Element not found for selector: " + selector);

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
    await new Promise(r => setTimeout(r, randomJitter(35, 75)));
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      x: targetPos.x,
      y: targetPos.y
    });

    return { clicked: true, target: selector, position: targetPos };
  }

  async type(selector, text, clearFirst = true) {
    if (clearFirst) {
      await this.evaluate(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
        })()
      `);
    }
    await this.click(selector);
    for (const char of text) {
      await this.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        text: char
      });
      await this.send("Input.dispatchKeyEvent", {
        type: "keyUp"
      });
      await new Promise(r => setTimeout(r, randomJitter(40, 110)));
    }
    return { typed: true, textLength: text.length };
  }

  async pressKey(key) {
    const keyCodes = {
      Enter: { code: "Enter", key: "Enter", keyCode: 13 },
      Escape: { code: "Escape", key: "Escape", keyCode: 27 },
      Tab: { code: "Tab", key: "Tab", keyCode: 9 },
      Backspace: { code: "Backspace", key: "Backspace", keyCode: 8 },
      ArrowDown: { code: "ArrowDown", key: "ArrowDown", keyCode: 40 },
      ArrowUp: { code: "ArrowUp", key: "ArrowUp", keyCode: 38 }
    };

    const info = keyCodes[key] || { code: key, key, keyCode: 0 };
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      windowsVirtualKeyCode: info.keyCode,
      code: info.code,
      key: info.key
    });
    await new Promise(r => setTimeout(r, randomJitter(40, 80)));
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      windowsVirtualKeyCode: info.keyCode,
      code: info.code,
      key: info.key
    });
    return { pressed: key };
  }

  async scroll(deltaY = 300) {
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: this.cursor.x,
      y: this.cursor.y,
      deltaX: 0,
      deltaY: deltaY
    });
    await new Promise(r => setTimeout(r, 200));
    return { scrolled: deltaY };
  }

  async screenshot(fullPage = false) {
    const params = { format: "png", quality: 80 };
    if (fullPage) {
      const layout = await this.send("Page.getLayoutMetrics");
      const width = Math.ceil(layout.contentSize.width);
      const height = Math.ceil(layout.contentSize.height);
      await this.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      });
      params.clip = { x: 0, y: 0, width, height, scale: 1 };
    }
    const res = await this.send("Page.captureScreenshot", params);
    if (fullPage) {
      await this.send("Emulation.clearDeviceMetricsOverride");
    }
    return {
      format: "png",
      base64Length: res.data.length,
      dataUrl: `data:image/png;base64,${res.data}`
    };
  }

  async extractContent() {
    return await this.evaluate(`
      (() => {
        const title = document.title || '';
        const url = window.location.href || '';
        const text = document.body ? document.body.innerText.slice(0, 20000) : '';
        const links = Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 30)
          .map(a => ({ text: a.innerText.trim(), href: a.href }))
          .filter(l => l.text && l.href.startsWith('http'));
        return { title, url, text, links };
      })()
    `);
  }

  async close() {
    try {
      if (this.ws) this.ws.close();
      if (this.chrome) this.chrome.kill();
    } catch (_) {}
  }
}

module.exports = { BrowserSession, findChromePath, getAvailablePort };
