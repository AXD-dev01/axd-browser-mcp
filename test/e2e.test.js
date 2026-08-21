/**
 * test/e2e.test.js — Live End-to-End Test Suite for @axd/browser-mcp (v1.1.0)
 * Tests real MCP protocol handshake, tools/list (11 tools), workspace suite calls, and browser tools.
 */

const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");

async function runE2ETest() {
  console.log("==================================================");
  console.log("🧪 STARTING E2E LIVE TEST FOR @axd/browser-mcp v1.1.0");
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
    if (initRes.serverInfo.version !== "1.1.0") {
      throw new Error(`Expected server version 1.1.0, got ${initRes.serverInfo.version}`);
    }

    // 2. Test Tools List (11 tools expected)
    console.log("▶ 2. Testing MCP tools/list...");
    const listRes = await callMcp("tools/list");
    const tools = listRes.tools || [];
    console.log(`   ✅ Tools discovered: ${tools.length} tools`);
    tools.forEach(t => console.log(`      - ${t.name}`));

    if (tools.length < 11) throw new Error("Expected at least 11 tools, found " + tools.length);

    // 3. Test chats_analyze_and_clean via MCP JSON-RPC
    console.log("▶ 3. Testing chats_analyze_and_clean via MCP call...");
    const chatRes = await callMcp("tools/call", {
      name: "chats_analyze_and_clean",
      arguments: { limit: 10, dryRun: true }
    });
    const chatData = JSON.parse(chatRes.content[0].text);
    console.log(`   ✅ chats_analyze_and_clean result: scanned=${chatData.totalSessionsScanned}, valid=${chatData.validChats}, duplicates=${chatData.duplicateGroups}`);

    // 4. Test projects_reorganize_tree via MCP JSON-RPC
    console.log("▶ 4. Testing projects_reorganize_tree via MCP call...");
    const projRes = await callMcp("tools/call", {
      name: "projects_reorganize_tree",
      arguments: { dryRun: true }
    });
    const projData = JSON.parse(projRes.content[0].text);
    console.log(`   ✅ projects_reorganize_tree result: projectsAudited=${projData.totalProjectsAudited}, compliance=${projData.overallComplianceScore}%`);

    // 5. Test cowork_space_manager via MCP JSON-RPC
    console.log("▶ 5. Testing cowork_space_manager via MCP call...");
    const coworkRes = await callMcp("tools/call", {
      name: "cowork_space_manager",
      arguments: { dryRun: true }
    });
    const coworkData = JSON.parse(coworkRes.content[0].text);
    console.log(`   ✅ cowork_space_manager result: spaces=${coworkData.activeSpacesCount}, indexGenerated=${coworkData.indexGenerated}`);

    // 6. Test Browser Content Extraction on data URL (No external server dependency)
    console.log("▶ 6. Testing browser_navigate & browser_extract on test page...");
    const testHtml = "data:text/html,<html><head><title>Sovereign%20Test%20Portal</title></head><body><h1>AXD%20Live</h1><p>Running%20v1.1.0</p></body></html>";
    const navRes = await callMcp("tools/call", {
      name: "browser_navigate",
      arguments: { url: testHtml, waitMs: 500 }
    });
    console.log("   ✅ Navigation result:", JSON.parse(navRes.content[0].text));

    const extRes = await callMcp("tools/call", {
      name: "browser_extract",
      arguments: {}
    });
    const content = JSON.parse(extRes.content[0].text);
    console.log(`   ✅ Extracted Title: "${content.title}" | Text: "${content.text.trim()}"`);

    // 7. Test JavaScript Evaluation
    console.log("▶ 7. Testing browser_evaluate...");
    const evalRes = await callMcp("tools/call", {
      name: "browser_evaluate",
      arguments: { expression: "document.title" }
    });
    console.log("   ✅ DOM Evaluated title:", JSON.parse(evalRes.content[0].text));

    // 8. Test Screenshot Capture
    console.log("▶ 8. Testing browser_screenshot...");
    const screenRes = await callMcp("tools/call", {
      name: "browser_screenshot",
      arguments: { fullPage: false }
    });
    const screenData = JSON.parse(screenRes.content[0].text);
    console.log(`   ✅ Screenshot captured: ${screenData.format} (Base64 size: ${screenData.base64Length} bytes)`);

    console.log("==================================================");
    console.log("🎉 ALL E2E PROTOCOL & SUITE TESTS PASSED 100%!");
    console.log("==================================================");
  } finally {
    proc.kill("SIGTERM");
  }
}

runE2ETest().catch((err) => {
  console.error("❌ E2E TEST FAILED:", err);
  process.exit(1);
});
