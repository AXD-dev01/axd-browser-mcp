# 🌐 @axd/browser-mcp

> **The Sovereign High-Speed Browser MCP Server for AI Agents**  
> *100x Faster than Pixel-Based CUA. 95% Cheaper. Un-bannable with Mathematical Human Cadence.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compliant](https://img.shields.io/badge/MCP-2024--11--05-emerald.svg)](https://modelcontextprotocol.io)
[![Patented Architecture](https://img.shields.io/badge/Patent-AU%20%232026900273-purple.svg)](https://lexgeneris.com)

---

## ⚡ Why @axd/browser-mcp?

Traditional AI Computer-Use tools (like TryCua or raw screenshot agents) take **full 3MB PNG screenshots on every step**, upload them to vision LLMs, and guess pixel coordinates. 

**This results in:**
- 🐌 **5+ second lag** per click.
- 💸 **$0.05 – $0.15 per click** in vision token costs.
- 🚫 **Instant Cloudflare bans** due to robotic linear mouse movements.

**`@axd/browser-mcp` solves this completely** using direct Chrome DevTools Protocol (CDP) and native Bezier input synthesis:

| Feature | Standard Pixel CUA | **@axd/browser-mcp** |
| :--- | :--- | :--- |
| **Execution Latency** | 3,000 – 5,000 ms | ⚡ **< 10 ms** (Sub-millisecond) |
| **Vision Token Cost** | ~$0.05 / action | 🆓 **$0.00** (Zero vision tokens) |
| **Anti-Bot Evasion** | ❌ Trips Cloudflare | 🛡️ **`humanize.js` Bezier Curves & Jitter** |
| **Privacy & Security** | ⚠️ Screens sent to cloud | 🔒 **100% On-Device / Non-Custodial** |

---

## 🚀 Quick Start (Claude Desktop / Cursor)

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "axd-browser": {
      "command": "npx",
      "args": ["-y", "@axd/browser-mcp"]
    }
  }
}
```

---

## 🛠️ Exposed MCP Tools

1. **`browser_navigate`**: Stealth URL navigation that bypasses bot fingerprinting.
2. **`browser_click`**: Clicks DOM elements using non-linear Bezier velocity curves.
3. **`browser_type`**: Types text with natural human inter-arrival keypress jitter.
4. **`browser_extract`**: Extracts clean text, title, and structure in <10ms.
5. **`browser_evaluate`**: Evaluates arbitrary in-browser JavaScript.

---

## 💼 Commercial & Pro Tier
* **Free Tier:** 100 autonomous browser actions per month.
* **Pro Tier ($29/mo):** Unlimited actions, multi-tab orchestration, and residential proxy routing.

**Author:** Diego Nanini  
**Inquiries:** diegonanini23@gmail.com
