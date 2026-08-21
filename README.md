# 🌐 axd-browser-mcp (v1.1.0)

> **The Sovereign High-Speed Browser & Workspace Intelligence MCP Server for AI Agents**  
> *100x Faster than Pixel-Based CUA. Zero Vision Token Waste. Autonomous Chat Deduplication & Canonical Workspace Reorganization.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compliant](https://img.shields.io/badge/MCP-2024--11--05-emerald.svg)](https://modelcontextprotocol.io)
[![Patented Architecture](https://img.shields.io/badge/Patent-AU%20%232026900273-purple.svg)](https://lexgeneris.com)

---

## 🏗️ Dual-Engine Architecture

```text
axd-browser-mcp (v1.1.0)
 ├── 🌐 Browser Engine (CDP, Stealth, Bezier Clicks, Fast Extraction)
 └── 📂 Workspace & Chat Intelligence Suite
      ├── 💬 chats_analyze_and_clean   (Scans, indexes, & dedups Claude & OpenAI sessions)
      ├── 🌲 projects_reorganize_tree (Audits & structures projects into canonical clean trees)
      └── 🤝 cowork_space_manager    (Syncs, indexes & cleans Claude Desktop Cowork spaces)
```

---

## ⚡ Why axd-browser-mcp?

Traditional AI Computer-Use tools take **full 3MB PNG screenshots on every step**, upload them to vision LLMs, and guess pixel coordinates. 

| Feature | Standard Pixel CUA | **axd-browser-mcp** |
| :--- | :--- | :--- |
| **Execution Latency** | 3,000 – 5,000 ms | ⚡ **< 10 ms** (Sub-millisecond) |
| **Vision Token Cost** | ~$0.05 / action | 🆓 **$0.00** (Zero vision tokens) |
| **Anti-Bot Evasion** | ❌ Trips Cloudflare | 🛡️ **`humanize.js` Bezier Curves & Jitter** |
| **Chat & Workspace Intelligence** | ❌ None | 🤖 **Automated Session Deduplication & Indexing** |
| **Privacy & Security** | ⚠️ Screens sent to cloud | 🔒 **100% Local / On-Device Non-Custodial** |

---

## 🚀 Quick Start (Claude Desktop / Cursor / OpenCode)

Add this to your MCP configuration (`claude_desktop_config.json` or `cursor.json`):

```json
{
  "mcpServers": {
    "axd-browser-mcp": {
      "command": "npx",
      "args": ["-y", "axd-browser-mcp"]
    }
  }
}
```

---

## 🛠️ Complete MCP Tool Registry (11 Tools)

### 🌐 High-Speed Browser Automation (8 Tools)
1. **`browser_navigate`**: Stealth URL navigation that bypasses bot fingerprinting & Cloudflare.
2. **`browser_click`**: Clicks DOM elements using mathematical Bezier curve velocity trajectory.
3. **`browser_type`**: Types text with natural human inter-arrival keystroke jitter.
4. **`browser_press_key`**: Simulates realistic hardware keypresses (Enter, Tab, Escape, Backspace, etc.).
5. **`browser_scroll`**: Smooth wheel scrolling with authentic momentum.
6. **`browser_screenshot`**: High-resolution viewport or full-page screen capture.
7. **`browser_extract`**: Extracts clean text, page title, URL, and interactive links in <10ms.
8. **`browser_evaluate`**: Evaluates arbitrary in-browser JavaScript expressions.

### 📂 Workspace & Chat Intelligence Suite (3 Tools)
9. **`chats_analyze_and_clean`**:
   - Recursively parses hundreds of `.jsonl` session files across `~/.claude/projects/` and OpenAI export archives.
   - Extracts conversation dates, token volumes, user topics, and message counts.
   - Identifies broken/stub transcripts (0-byte, error-only) and redundant duplicate threads.
   - Compiles a clean, searchable markdown catalog (`MASTER_CHAT_CATALOG.md`).
   - Safely stages junk/stub sessions to `~/Quarantine/chat_stubs/`.

10. **`projects_reorganize_tree`**:
    - Audits workspace directories across `~/Claude` and `~/§00_AXD_Sovereign_empire/`.
    - Enforces canonical architecture (`01_Product`, `AI_review`, `Human_review`, `Docs`, `Quarantine`).
    - Scans for leaked credentials (`.env`, OpenAI `sk-...`, GitHub `ghp-...`, Slack, AWS keys).
    - Detects junk files (`.pyc`, `__pycache__`, `.DS_Store`) and stages them safely to `~/Quarantine/`.

11. **`cowork_space_manager`**:
    - Coordinates Claude Desktop's `coworkUserFilesPath` workspace.
    - Cleans up stale temp files, lock files, and cached index tags.
    - Generates and maintains `COWORK_INDEX.md` cross-linking all active projects with metadata, stacks, and documentation pointers.

---

## 🧪 Testing

```bash
# Run unit & integration tests
npm test

# Run live E2E MCP JSON-RPC protocol test
npm run test:e2e
```

---

## 💼 Commercial & Pro Tier
* **Free Tier:** 100 autonomous browser actions & workspace scans per month.
* **Pro Tier ($29/mo):** Unlimited actions, multi-tab orchestration, and residential proxy routing.

**Author:** Diego Nanini  
**Inquiries:** diegonanini23@gmail.com
