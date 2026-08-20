/**
 * test/e2e.test.js — Live End-to-End Test Suite for @axd/browser-mcp
 * Tests real browser launch, CDP connection, navigation, extraction, evaluation, and screenshots.
 */

const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");

async function runE2ETest() {
  console.log("==================================================");
  console.log("🧪 STARTING E2E LIVE TEST FOR @axd/browser-mcp");
  console.log("==================================================");

  const serverPath = path.join(__dirname, "../src/index.js");
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "inherit"]
  });

  const rl = readline.createInterface({ input: proc.stdout });
  let nextId = 1;
  const pending = new Map();

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      if (pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    } catch (_) {}
  });

  const callMcp = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };

  try {
    // 1. Test Initialize
    console.log("▶ 1. Testing MCP initialize handshake...");
    const initRes = await callMcp("initialize");
    console.log("   ✅ Initialized:", initRes.serverInfo);

    // 2. Test Tools List
    console.log("▶ 2. Testing MCP tools/list...");
    const listRes = await callMcp("tools/list");
    const tools = listRes.tools || [];
    console.log(`   ✅ Tools discovered: ${tools.length} tools`);
    tools.forEach(t => console.log(`      - ${t.name}`));

    if (tools.length < 8) throw new Error("Expected at least 8 tools, found " + tools.length);

    // 3. Test Navigation to live Portal
    console.log("▶ 3. Testing browser_navigate to http://127.0.0.1:8080...");
    const navRes = await callMcp("tools/call", {
      name: "browser_navigate",
      arguments: { url: "http://127.0.0.1:8080", waitMs: 2000 }
    });
    console.log("   ✅ Navigation result:", JSON.parse(navRes.content[0].text));

    // 4. Test Content Extraction
    console.log("▶ 4. Testing browser_extract...");
    const extRes = await callMcp("tools/call", {
      name: "browser_extract",
      arguments: {}
    });
    const content = JSON.parse(extRes.content[0].text);
    console.log(`   ✅ Extracted Title: "${content.title}" | Links: ${content.links ? content.links.length : 0} | Text length: ${content.text.length} chars`);

    // 5. Test JavaScript Evaluation
    console.log("▶ 5. Testing browser_evaluate (DOM node count)...");
    const evalRes = await callMcp("tools/call", {
      name: "browser_evaluate",
      arguments: { expression: "document.querySelectorAll('*').length" }
    });
    console.log("   ✅ DOM Nodes count:", JSON.parse(evalRes.content[0].text));

    // 6. Test Screenshot Capture
    console.log("▶ 6. Testing browser_screenshot...");
    const screenRes = await callMcp("tools/call", {
      name: "browser_screenshot",
      arguments: { fullPage: false }
    });
    const screenData = JSON.parse(screenRes.content[0].text);
    console.log(`   ✅ Screenshot captured: ${screenData.format} (Base64 size: ${screenData.base64Length} bytes)`);

    // 7. Test Smooth Scroll
    console.log("▶ 7. Testing browser_scroll...");
    const scrollRes = await callMcp("tools/call", {
      name: "browser_scroll",
      arguments: { deltaY: 250 }
    });
    console.log("   ✅ Scroll result:", JSON.parse(scrollRes.content[0].text));

    console.log("==================================================");
    console.log("🎉 ALL 7 E2E LIVE TESTS PASSED WITH 100% SUCCESS!");
    console.log("==================================================");
  } finally {
    proc.kill("SIGTERM");
  }
}

runE2ETest().catch((err) => {
  console.error("❌ E2E TEST FAILED:", err);
  process.exit(1);
});
