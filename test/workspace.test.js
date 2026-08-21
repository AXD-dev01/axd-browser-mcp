/**
 * test/workspace.test.js — Unit and Integration Tests for Workspace & Chat Intelligence Suite
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chatsAnalyzeAndClean, projectsReorganizeTree, coworkSpaceManager } = require("../src/workspace");

async function runWorkspaceTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING WORKSPACE & CHAT INTELLIGENCE SUITE TESTS");
  console.log("==================================================");

  // Setup temporary test fixture directory
  const testRoot = path.join(os.tmpdir(), "axd_mcp_test_" + Date.now());
  const fakeProjects = path.join(testRoot, "projects");
  const fakeWorkspaces = path.join(testRoot, "empire");
  const fakeQuarantine = path.join(testRoot, "quarantine");

  fs.mkdirSync(fakeProjects, { recursive: true });
  fs.mkdirSync(fakeWorkspaces, { recursive: true });
  fs.mkdirSync(fakeQuarantine, { recursive: true });

  try {
    // -------------------------------------------------------------
    // Test 1: chatsAnalyzeAndClean with stubs & duplicates
    // -------------------------------------------------------------
    console.log("▶ 1. Testing chatsAnalyzeAndClean...");
    const proj1 = path.join(fakeProjects, "project-alpha");
    fs.mkdirSync(proj1, { recursive: true });

    // Valid chat 1
    const chat1Path = path.join(proj1, "chat-1.jsonl");
    fs.writeFileSync(chat1Path, [
      JSON.stringify({ type: "custom-title", customTitle: "Build sovereign browser engine" }),
      JSON.stringify({ type: "user", content: "Build a high speed CDP browser engine", timestamp: "2026-08-01T10:00:00Z" }),
      JSON.stringify({ type: "assistant", content: "Here is the implementation...", timestamp: "2026-08-01T10:01:00Z" })
    ].join("\n"), "utf8");

    // Duplicate of chat 1 (same user prompt)
    const chat2Path = path.join(proj1, "chat-2.jsonl");
    fs.writeFileSync(chat2Path, [
      JSON.stringify({ type: "custom-title", customTitle: "Build sovereign browser engine v2" }),
      JSON.stringify({ type: "user", content: "Build a high speed CDP browser engine", timestamp: "2026-08-02T10:00:00Z" }),
      JSON.stringify({ type: "assistant", content: "Sure, here is the updated version...", timestamp: "2026-08-02T10:01:00Z" })
    ].join("\n"), "utf8");

    // Stub chat (0-byte)
    const chat3Path = path.join(proj1, "chat-empty.jsonl");
    fs.writeFileSync(chat3Path, "", "utf8");

    // Stub chat (no user messages)
    const chat4Path = path.join(proj1, "chat-error-only.jsonl");
    fs.writeFileSync(chat4Path, JSON.stringify({ type: "attachment", content: "Hook error" }), "utf8");

    const catalogPath = path.join(testRoot, "TEST_CATALOG.md");
    const chatRes = await chatsAnalyzeAndClean({
      projectsDir: fakeProjects,
      outputCatalogPath: catalogPath,
      quarantineDir: fakeQuarantine,
      cleanStubs: true,
      dryRun: false
    });

    assert.strictEqual(chatRes.status, "success");
    assert.strictEqual(chatRes.totalSessionsScanned, 4);
    assert.strictEqual(chatRes.validChats, 2);
    assert.strictEqual(chatRes.stubChats, 2);
    assert.strictEqual(chatRes.duplicateGroups, 1);
    assert.strictEqual(chatRes.catalogWritten, true);
    assert.ok(fs.existsSync(catalogPath), "MASTER_CHAT_CATALOG.md was generated");

    const catalogContent = fs.readFileSync(catalogPath, "utf8");
    assert.ok(catalogContent.includes("Build sovereign browser engine"), "Catalog contains chat title");
    assert.ok(catalogContent.includes("Duplicate & Redundant"), "Catalog identifies duplicate cluster");
    console.log("   ✅ chatsAnalyzeAndClean passed!");

    // -------------------------------------------------------------
    // Test 2: projectsReorganizeTree auditing & canonical enforcement
    // -------------------------------------------------------------
    console.log("▶ 2. Testing projectsReorganizeTree...");
    const subProj1 = path.join(fakeWorkspaces, "01_Alpha_App");
    fs.mkdirSync(path.join(subProj1, "01_Product"), { recursive: true });
    fs.mkdirSync(path.join(subProj1, "Docs"), { recursive: true });
    // Write a dummy junk file
    fs.writeFileSync(path.join(subProj1, "junk.pyc"), "fake bytecode");
    // Write package.json
    fs.writeFileSync(path.join(subProj1, "package.json"), JSON.stringify({ name: "alpha" }));

    const reorgRes = await projectsReorganizeTree({
      targetDir: fakeWorkspaces,
      enforceCanonical: true,
      stageJunkToQuarantine: true,
      quarantineDir: fakeQuarantine,
      dryRun: false
    });

    assert.strictEqual(reorgRes.status, "success");
    assert.strictEqual(reorgRes.totalProjectsAudited, 1);
    assert.strictEqual(reorgRes.auditedProjects[0].detectedStack, "Node.js / TypeScript");
    assert.strictEqual(reorgRes.junkFilesFound.length, 1);

    // Verify canonical missing dirs were created
    assert.ok(fs.existsSync(path.join(subProj1, "AI_review")), "AI_review created");
    assert.ok(fs.existsSync(path.join(subProj1, "Human_review")), "Human_review created");
    assert.ok(fs.existsSync(path.join(subProj1, "Quarantine")), "Quarantine created");
    console.log("   ✅ projectsReorganizeTree passed!");

    // -------------------------------------------------------------
    // Test 3: coworkSpaceManager index & temp files
    // -------------------------------------------------------------
    console.log("▶ 3. Testing coworkSpaceManager...");
    // Create a README in subProj1
    fs.writeFileSync(path.join(subProj1, "README.md"), "# Alpha App\nAutonomous testing engine.");
    // Create a temp file in fakeWorkspaces root
    fs.writeFileSync(path.join(fakeWorkspaces, "scratch.tmp"), "temporary data");

    const coworkIndex = path.join(fakeWorkspaces, "COWORK_INDEX.md");
    const coworkRes = await coworkSpaceManager({
      coworkPath: fakeWorkspaces,
      cleanTempFiles: true,
      generateIndex: true,
      outputIndexPath: coworkIndex,
      quarantineDir: fakeQuarantine,
      dryRun: false
    });

    assert.strictEqual(coworkRes.status, "success");
    assert.strictEqual(coworkRes.activeSpacesCount, 1);
    assert.strictEqual(coworkRes.spaces[0].name, "01_Alpha_App");
    assert.strictEqual(coworkRes.spaces[0].primaryDoc, "README.md");
    assert.strictEqual(coworkRes.tempFilesFound.length, 1);
    assert.strictEqual(coworkRes.cleanedCount, 1);
    assert.ok(fs.existsSync(coworkIndex), "COWORK_INDEX.md was created");

    const indexContent = fs.readFileSync(coworkIndex, "utf8");
    assert.ok(indexContent.includes("01_Alpha_App"), "COWORK_INDEX includes active project");
    console.log("   ✅ coworkSpaceManager passed!");

    console.log("==================================================");
    console.log("🎉 ALL WORKSPACE SUITE TESTS PASSED 100%!");
    console.log("==================================================");
  } finally {
    // Clean up temporary fixture directory
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch (_) {}
  }
}

runWorkspaceTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
