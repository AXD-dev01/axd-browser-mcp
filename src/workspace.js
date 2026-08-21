/**
 * src/workspace.js — Sovereign Workspace & Chat Intelligence Suite
 * Part of @axd/browser-mcp (v1.1.0)
 *
 * Provides:
 * 1. chats_analyze_and_clean: Scans ~/.claude/projects/ & OpenAI exports, deduplicates, flags stubs, and builds MASTER_CHAT_CATALOG.md
 * 2. projects_reorganize_tree: Audits project structures, enforces canonical trees, flags leaked credentials/junk, stages to ~/Quarantine/
 * 3. cowork_space_manager: Manages Claude Desktop coworkUserFilesPath (~/Claude), cleans stale temp files, builds COWORK_INDEX.md
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

/**
 * Expand leading ~ to user's home directory.
 */
function resolveHome(p) {
  if (!p) return "";
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

/**
 * Ensure directory exists synchronously.
 */
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Calculate MD5 hash of a string.
 */
function hashString(str) {
  return crypto.createHash("md5").update(str || "").digest("hex");
}

/**
 * Safely read file content with max size limit (default 10MB to avoid OOM).
 */
function safeReadFile(filePath, maxBytes = 10 * 1024 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return "";
    if (stat.size > maxBytes) {
      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(maxBytes);
      fs.readSync(fd, buffer, 0, maxBytes, 0);
      fs.closeSync(fd);
      return buffer.toString("utf8");
    }
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return null;
  }
}

/**
 * Default search roots for project and cowork trees.
 */
function getDefaultWorkspaceRoot() {
  const sovereign = path.join(os.homedir(), "§00_AXD_Sovereign_empire");
  if (fs.existsSync(sovereign)) return sovereign;
  const claudeDir = path.join(os.homedir(), "Claude");
  if (fs.existsSync(claudeDir)) return claudeDir;
  return os.homedir();
}

/**
 * -----------------------------------------------------------------------------
 * 1. CHATS ANALYZE AND CLEAN
 * -----------------------------------------------------------------------------
 */
async function chatsAnalyzeAndClean(options = {}) {
  const defaultProjectsDir = path.join(os.homedir(), ".claude", "projects");
  const projectsDir = resolveHome(options.projectsDir || defaultProjectsDir);
  const openAiExportPath = options.openAiExportPath ? resolveHome(options.openAiExportPath) : null;
  const defaultCatalog = path.join(os.homedir(), "Claude", "MASTER_CHAT_CATALOG.md");
  const outputCatalogPath = resolveHome(options.outputCatalogPath || defaultCatalog);
  const quarantineDir = resolveHome(options.quarantineDir || path.join(os.homedir(), "Quarantine", "chat_stubs"));
  const cleanStubs = Boolean(options.cleanStubs);
  const dryRun = options.dryRun !== false; // default true
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : Infinity;
  const searchQuery = options.searchQuery ? options.searchQuery.toLowerCase() : null;

  const results = {
    totalSessionsScanned: 0,
    validChats: 0,
    stubChats: 0,
    duplicateGroupsCount: 0,
    totalMessagesCount: 0,
    totalEstimatedTokens: 0,
    totalFileSizeBytes: 0,
    stagedStubs: [],
    duplicateClusters: [],
    catalogPath: outputCatalogPath,
    dryRun,
    chats: []
  };

  const sessions = [];
  const promptHashMap = new Map(); // hash -> array of session items

  // 1. Scan Claude ~/.claude/projects/
  if (fs.existsSync(projectsDir)) {
    try {
      const projectEntries = fs.readdirSync(projectsDir, { withFileTypes: true });

      for (const entry of projectEntries) {
        if (sessions.length >= limit) break;
        const fullPath = path.join(projectsDir, entry.name);

        if (entry.isDirectory()) {
          try {
            const subFiles = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const sub of subFiles) {
              if (sessions.length >= limit) break;
              if (sub.isFile() && sub.name.endsWith(".jsonl")) {
                const filePath = path.join(fullPath, sub.name);
                const item = parseClaudeSessionFile(filePath, entry.name);
                if (item) sessions.push(item);
              }
            }
          } catch (_) {}
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          const item = parseClaudeSessionFile(fullPath, "root");
          if (item) sessions.push(item);
        }
      }
    } catch (_) {}
  }

  // 2. Scan OpenAI exports if present or specified
  const openAiPaths = [];
  if (openAiExportPath && fs.existsSync(openAiExportPath)) {
    openAiPaths.push(openAiExportPath);
  } else if (options.autoDiscoverOpenAi === true) {
    // Auto-discover common export directories
    const commonSearchDirs = [
      path.join(os.homedir(), "Downloads", "sovereign_scrape"),
      path.join(os.homedir(), "Downloads"),
      path.join(os.homedir(), "Claude")
    ];
    for (const sDir of commonSearchDirs) {
      if (fs.existsSync(sDir)) {
        try {
          const files = fs.readdirSync(sDir);
          for (const f of files) {
            const fPath = path.join(sDir, f);
            if (fs.existsSync(fPath) && fs.statSync(fPath).isDirectory()) {
              try {
                const inner = fs.readdirSync(fPath);
                for (const inf of inner) {
                  if (inf.endsWith("conversations.json") && !inf.includes("backup")) {
                    openAiPaths.push(path.join(fPath, inf));
                  }
                }
              } catch (_) {}
            } else if (f.endsWith("conversations.json") && !f.includes("backup")) {
              openAiPaths.push(fPath);
            }
          }
        } catch (_) {}
      }
    }
  }

  for (const oPath of openAiPaths.slice(0, 5)) {
    if (sessions.length >= limit) break;
    const parsedOpenAi = parseOpenAiExportFile(oPath, Math.min(200, limit - sessions.length));
    for (const item of parsedOpenAi) {
      if (sessions.length >= limit) break;
      sessions.push(item);
    }
  }

  // 3. Process sessions, identify stubs, duplicates, tokens, topics
  for (const session of sessions) {
    results.totalSessionsScanned++;
    results.totalFileSizeBytes += session.fileSize || 0;
    results.totalMessagesCount += (session.userMessages + session.assistantMessages);
    results.totalEstimatedTokens += session.estimatedTokens || 0;

    // Filter by search query if provided
    if (searchQuery) {
      const match = (session.title && session.title.toLowerCase().includes(searchQuery)) ||
                    (session.firstPrompt && session.firstPrompt.toLowerCase().includes(searchQuery)) ||
                    (session.project && session.project.toLowerCase().includes(searchQuery));
      if (!match) continue;
    }

    if (session.isStub) {
      results.stubChats++;
      if (cleanStubs) {
        results.stagedStubs.push({
          sessionId: session.sessionId,
          filePath: session.filePath,
          reason: session.stubReason,
          action: dryRun ? "staged_preview" : "moved_to_quarantine"
        });

        if (!dryRun) {
          try {
            ensureDirSync(quarantineDir);
            const dest = path.join(quarantineDir, `${session.sessionId}.jsonl`);
            fs.renameSync(session.filePath, dest);
            const assocDir = session.filePath.replace(/\.jsonl$/, "");
            if (fs.existsSync(assocDir) && fs.statSync(assocDir).isDirectory()) {
              const assocDest = path.join(quarantineDir, session.sessionId);
              fs.renameSync(assocDir, assocDest);
            }
          } catch (err) {
            session.quarantineError = err.message;
          }
        }
      }
    } else {
      results.validChats++;
    }

    // Duplicate detection based on prompt hash
    if (session.promptHash && !session.isStub) {
      if (!promptHashMap.has(session.promptHash)) {
        promptHashMap.set(session.promptHash, []);
      }
      promptHashMap.get(session.promptHash).push(session);
    }

    results.chats.push(session);
  }

  // Find duplicate clusters (>1 session with same hash)
  for (const [hash, group] of promptHashMap.entries()) {
    if (group.length > 1) {
      results.duplicateGroupsCount++;
      results.duplicateClusters.push({
        promptHash: hash,
        count: group.length,
        promptPreview: group[0].firstPrompt ? group[0].firstPrompt.slice(0, 150) : group[0].title,
        sessions: group.map(g => ({
          sessionId: g.sessionId,
          source: g.source,
          createdDate: g.createdDate,
          project: g.project,
          filePath: g.filePath,
          messages: g.userMessages + g.assistantMessages
        }))
      });
    }
  }

  // 4. Generate Master Chat Catalog Markdown
  const catalogMarkdown = generateMasterChatCatalogMarkdown(results);
  let catalogWritten = false;
  try {
    ensureDirSync(path.dirname(outputCatalogPath));
    fs.writeFileSync(outputCatalogPath, catalogMarkdown, "utf8");
    catalogWritten = true;
  } catch (_) {
    catalogWritten = false;
  }

  return {
    status: "success",
    totalSessionsScanned: results.totalSessionsScanned,
    validChats: results.validChats,
    stubChats: results.stubChats,
    duplicateGroups: results.duplicateGroupsCount,
    totalMessages: results.totalMessagesCount,
    totalEstimatedTokens: results.totalEstimatedTokens,
    totalFileSizeMB: (results.totalFileSizeBytes / (1024 * 1024)).toFixed(2),
    cleanStubsRequested: cleanStubs,
    dryRun,
    stagedStubsCount: results.stagedStubs.length,
    duplicateClustersCount: results.duplicateClusters.length,
    duplicateClusters: results.duplicateClusters.slice(0, 10),
    catalogPath: outputCatalogPath,
    catalogWritten,
    sampleRecentChats: results.chats
      .filter(c => !c.isStub)
      .slice(-10)
      .map(c => ({
        sessionId: c.sessionId,
        title: c.title,
        createdDate: c.createdDate,
        project: c.project,
        messages: c.userMessages + c.assistantMessages,
        tokens: c.estimatedTokens
      }))
  };
}

/**
 * Parse a single Claude .jsonl session file.
 */
function parseClaudeSessionFile(filePath, projectName) {
  try {
    const stat = fs.statSync(filePath);
    const sessionId = path.basename(filePath, ".jsonl");

    if (stat.size === 0) {
      return {
        sessionId,
        source: "Claude CLI / Desktop",
        project: projectName,
        filePath,
        fileSize: 0,
        title: "Empty Session",
        firstPrompt: "",
        userMessages: 0,
        assistantMessages: 0,
        toolCalls: 0,
        estimatedTokens: 0,
        createdDate: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
        updatedDate: stat.mtime.toISOString(),
        isStub: true,
        stubReason: "0-byte empty transcript file",
        promptHash: null
      };
    }

    const content = safeReadFile(filePath, 2 * 1024 * 1024);
    if (!content) {
      return {
        sessionId,
        source: "Claude CLI / Desktop",
        project: projectName,
        filePath,
        fileSize: stat.size,
        title: "Unreadable Session",
        firstPrompt: "",
        userMessages: 0,
        assistantMessages: 0,
        toolCalls: 0,
        estimatedTokens: 0,
        createdDate: stat.mtime.toISOString(),
        updatedDate: stat.mtime.toISOString(),
        isStub: true,
        stubReason: "File read error or binary content",
        promptHash: null
      };
    }

    const lines = content.split("\n").filter(l => l.trim().length > 0);
    let title = null;
    let firstPrompt = null;
    let userMessages = 0;
    let assistantMessages = 0;
    let toolCalls = 0;
    let totalTokens = 0;
    let earliestTs = null;
    let latestTs = null;
    let isErrorOnly = true;

    for (const line of lines) {
      try {
        const record = JSON.parse(line);

        if (record.timestamp) {
          const t = new Date(record.timestamp).getTime();
          if (!isNaN(t)) {
            if (!earliestTs || t < earliestTs) earliestTs = t;
            if (!latestTs || t > latestTs) latestTs = t;
          }
        }

        if (record.type === "custom-title" && record.customTitle) {
          title = record.customTitle;
        } else if (!title && record.agentName) {
          title = record.agentName;
        }

        // Extract user message
        if (record.type === "user" || record.role === "user" || (record.message && record.message.role === "user")) {
          userMessages++;
          isErrorOnly = false;
          if (!firstPrompt) {
            let pText = "";
            if (typeof record.content === "string") pText = record.content;
            else if (typeof record.message?.content === "string") pText = record.message.content;
            else if (Array.isArray(record.content)) {
              pText = record.content.map(c => (typeof c === "string" ? c : c.text || "")).join(" ");
            }
            const cleanP = pText.replace(/<persisted-output>[\s\S]*?<\/persisted-output>/g, "").trim();
            firstPrompt = (cleanP || pText).slice(0, 300);
          }
        }

        if (record.type === "assistant" || record.role === "assistant" || (record.message && record.message.role === "assistant")) {
          assistantMessages++;
          isErrorOnly = false;
        }

        if (record.type === "tool_use" || record.toolUseID) {
          toolCalls++;
        }

        if (record.usage) {
          totalTokens += (record.usage.input_tokens || 0) + (record.usage.output_tokens || 0);
        }
      } catch (_) {}
    }

    if (totalTokens === 0) {
      totalTokens = Math.round(content.length / 4);
    }

    const createdIso = earliestTs ? new Date(earliestTs).toISOString() : (stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString());
    const updatedIso = latestTs ? new Date(latestTs).toISOString() : stat.mtime.toISOString();

    const isStub = lines.length <= 2 || userMessages === 0 || isErrorOnly;
    let stubReason = null;
    if (isStub) {
      if (userMessages === 0) stubReason = "No user interactions / system hook only";
      else if (lines.length <= 2) stubReason = "Single turn abort / truncated stub";
      else stubReason = "Incomplete or error-only session";
    }

    const normalizedTitle = title || (firstPrompt ? firstPrompt.slice(0, 60).replace(/[\r\n]+/g, " ") : "Untitled Session");
    const promptHash = firstPrompt ? hashString(firstPrompt.trim().toLowerCase()) : null;

    return {
      sessionId,
      source: "Claude CLI / Desktop",
      project: projectName,
      filePath,
      fileSize: stat.size,
      title: normalizedTitle,
      firstPrompt: firstPrompt || "",
      userMessages,
      assistantMessages,
      toolCalls,
      estimatedTokens: totalTokens,
      createdDate: createdIso,
      updatedDate: updatedIso,
      isStub,
      stubReason,
      promptHash
    };
  } catch (err) {
    return null;
  }
}

/**
 * Parse OpenAI conversations.json export file.
 */
function parseOpenAiExportFile(filePath, maxChats = 200) {
  const results = [];
  try {
    const raw = safeReadFile(filePath, 20 * 1024 * 1024);
    if (!raw) return results;
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return results;

    for (const conv of json.slice(0, maxChats)) {
      const sessionId = conv.id || conv.conversation_id || crypto.randomUUID();
      const title = conv.title || "ChatGPT Conversation";
      let userMessages = 0;
      let assistantMessages = 0;
      let firstPrompt = "";
      let totalTokens = 0;

      if (conv.mapping) {
        for (const key of Object.keys(conv.mapping)) {
          const node = conv.mapping[key];
          if (node && node.message) {
            const role = node.message.author?.role;
            if (role === "user") {
              userMessages++;
              if (!firstPrompt && node.message.content?.parts) {
                firstPrompt = node.message.content.parts.filter(p => typeof p === "string").join(" ").slice(0, 300);
              }
            } else if (role === "assistant") {
              assistantMessages++;
            }
          }
        }
      }

      totalTokens = Math.round(((userMessages + assistantMessages) * 250));
      const createdDate = conv.create_time ? new Date(conv.create_time * 1000).toISOString() : new Date().toISOString();
      const updatedDate = conv.update_time ? new Date(conv.update_time * 1000).toISOString() : createdDate;
      const isStub = userMessages === 0;

      results.push({
        sessionId,
        source: "OpenAI Export",
        project: "ChatGPT Archive",
        filePath,
        fileSize: raw.length,
        title,
        firstPrompt,
        userMessages,
        assistantMessages,
        toolCalls: 0,
        estimatedTokens: totalTokens,
        createdDate,
        updatedDate,
        isStub,
        stubReason: isStub ? "Empty ChatGPT export conversation" : null,
        promptHash: firstPrompt ? hashString(firstPrompt.trim().toLowerCase()) : null
      });
    }
  } catch (_) {}
  return results;
}

/**
 * Generate MASTER_CHAT_CATALOG.md
 */
function generateMasterChatCatalogMarkdown(data) {
  const dateStr = new Date().toISOString().split("T")[0];
  let md = `# 💬 MASTER CHAT CATALOG & INTELLIGENCE INDEX\n\n`;
  md += `> Generated on **${dateStr}** by \`@axd/browser-mcp\` Workspace & Chat Intelligence Suite.\n\n`;
  md += `## 📊 Executive Overview\n\n`;
  md += `| Metric | Count / Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Total Sessions Scanned** | \`${data.totalSessionsScanned}\` |\n`;
  md += `| **Valid Active Chats** | \`${data.validChats}\` |\n`;
  md += `| **Stub / Broken Sessions** | \`${data.stubChats}\` |\n`;
  md += `| **Duplicate Thread Clusters** | \`${data.duplicateGroupsCount}\` |\n`;
  md += `| **Total Messages Indexed** | \`${data.totalMessagesCount.toLocaleString()}\` |\n`;
  md += `| **Total Estimated Tokens** | \`${data.totalEstimatedTokens.toLocaleString()}\` |\n`;
  md += `| **Total Catalog Storage** | \`${(data.totalFileSizeBytes / (1024 * 1024)).toFixed(2)} MB\` |\n\n`;

  // Duplicate Thread Clusters
  if (data.duplicateClusters && data.duplicateClusters.length > 0) {
    md += `## 🔁 Duplicate & Redundant Thread Clusters\n\n`;
    md += `Identified **${data.duplicateClusters.length}** clusters of chats with identical user prompts.\n\n`;
    data.duplicateClusters.forEach((cluster, idx) => {
      md += `### Cluster #${idx + 1} (${cluster.count} duplicate sessions)\n`;
      md += `> **Prompt Anchor:** _"${cluster.promptPreview.replace(/[\r\n]+/g, " ")}"_\n\n`;
      md += `| Session ID | Source / Project | Date | Messages |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      cluster.sessions.forEach(s => {
        md += `| \`${s.sessionId.slice(0, 12)}...\` | \`${s.project}\` | ${s.createdDate.split("T")[0]} | ${s.messages} |\n`;
      });
      md += `\n`;
    });
  }

  // Active Chats Table
  md += `## 🗂️ Active Conversation Catalog\n\n`;
  md += `| Date | Project / Space | Title / Topic | Messages | Est. Tokens | Session ID |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  const validChats = data.chats.filter(c => !c.isStub).sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
  const previewChats = validChats.slice(0, 100);

  for (const c of previewChats) {
    const cleanTitle = (c.title || "Untitled").replace(/\|/g, "-").replace(/[\r\n]+/g, " ").slice(0, 65);
    const date = c.createdDate ? c.createdDate.split("T")[0] : "-";
    const msgs = `${c.userMessages}u / ${c.assistantMessages}a`;
    const tokens = c.estimatedTokens ? c.estimatedTokens.toLocaleString() : "0";
    md += `| ${date} | \`${c.project}\` | ${cleanTitle} | ${msgs} | ${tokens} | \`${c.sessionId.slice(0, 8)}\` |\n`;
  }

  if (validChats.length > 100) {
    md += `\n_... and ${validChats.length - 100} more active conversations indexed._\n\n`;
  }

  // Stub / Broken Chats
  const stubs = data.chats.filter(c => c.isStub);
  if (stubs.length > 0) {
    md += `## ⚠️ Stub & Broken Transcripts (${stubs.length})\n\n`;
    md += `| Session ID | Project | Reason | Size | Path |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    for (const s of stubs.slice(0, 50)) {
      md += `| \`${s.sessionId.slice(0, 8)}\` | \`${s.project}\` | ${s.stubReason || "Empty"} | ${s.fileSize} B | \`${s.filePath}\` |\n`;
    }
    md += `\n`;
  }

  return md;
}

/**
 * -----------------------------------------------------------------------------
 * 2. PROJECTS REORGANIZE TREE
 * -----------------------------------------------------------------------------
 */
const CANONICAL_STRUCTURE = ["01_Product", "AI_review", "Human_review", "Docs", "Quarantine"];
const CREDENTIAL_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI key
  /ghp_[a-zA-Z0-9]{20,}/g, // GitHub PAT
  /xoxb-[a-zA-Z0-9]{20,}/g, // Slack token
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  /AIza[0-9A-Za-z\-_]{35}/g // Google API Key
];

const CREDENTIAL_FILENAMES = [
  ".env",
  ".env.local",
  ".env.production",
  ".credentials.json",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "service_account.json"
];

const JUNK_PATTERNS = [
  /\.pyc$/,
  /\.DS_Store$/,
  /Thumbs\.db$/,
  /\.swp$/,
  /\.swo$/,
  /~$/
];

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  ".cache",
  "target",
  ".cargo",
  ".gemini"
]);

async function projectsReorganizeTree(options = {}) {
  const targetDir = resolveHome(options.targetDir || getDefaultWorkspaceRoot());
  const canonicalDirs = options.canonicalDirs || CANONICAL_STRUCTURE;
  const enforceCanonical = Boolean(options.enforceCanonical);
  const stageJunkToQuarantine = Boolean(options.stageJunkToQuarantine);
  const quarantineDir = resolveHome(options.quarantineDir || path.join(os.homedir(), "Quarantine"));
  const dryRun = options.dryRun !== false; // default true

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }

  const results = {
    status: "success",
    targetDir,
    auditedProjects: [],
    totalProjectsAudited: 0,
    overallComplianceScore: 100,
    securityIssues: [],
    junkFilesFound: [],
    mislocatedExports: [],
    remediationActions: [],
    dryRun
  };

  // Discover top-level projects in targetDir
  const topEntries = fs.readdirSync(targetDir, { withFileTypes: true });
  const projectDirs = [];

  for (const entry of topEntries) {
    if (entry.isDirectory() && !entry.name.startsWith(".") && !IGNORE_DIRS.has(entry.name)) {
      projectDirs.push(path.join(targetDir, entry.name));
    }
  }

  let totalScore = 0;

  for (const pDir of projectDirs) {
    const projectName = path.basename(pDir);

    const projectAudit = {
      name: projectName,
      path: pDir,
      hasCanonicalStructure: true,
      existingCanonicalDirs: [],
      missingCanonicalDirs: [],
      complianceScore: 100,
      detectedStack: detectProjectStack(pDir)
    };

    // Check canonical folders
    for (const cDir of canonicalDirs) {
      const cPath = path.join(pDir, cDir);
      const isMainAlias = cDir === "01_Product" && (fs.existsSync(path.join(pDir, "Main")) || fs.existsSync(path.join(pDir, "01_product")));
      const isTrashAlias = cDir === "Quarantine" && (fs.existsSync(path.join(pDir, "Trash")) || fs.existsSync(path.join(pDir, "quarantine")));

      if (fs.existsSync(cPath) || isMainAlias || isTrashAlias) {
        projectAudit.existingCanonicalDirs.push(cDir);
      } else {
        projectAudit.missingCanonicalDirs.push(cDir);
      }
    }

    projectAudit.complianceScore = Math.round(
      (projectAudit.existingCanonicalDirs.length / canonicalDirs.length) * 100
    );
    if (projectAudit.missingCanonicalDirs.length > 0) {
      projectAudit.hasCanonicalStructure = false;
    }
    totalScore += projectAudit.complianceScore;

    // Enforce canonical directories if requested
    if (enforceCanonical && projectAudit.missingCanonicalDirs.length > 0) {
      for (const missing of projectAudit.missingCanonicalDirs) {
        const newDir = path.join(pDir, missing);
        results.remediationActions.push({
          action: "create_canonical_dir",
          path: newDir,
          project: projectName,
          status: dryRun ? "staged_preview" : "created"
        });
        if (!dryRun) {
          ensureDirSync(newDir);
        }
      }
    }

    // Fast scan project files for security secrets, junk, mislocated exports (maxDepth 2, maxFiles 100 per project)
    const scanState = { fileCount: 0 };
    scanProjectFiles(pDir, results, stageJunkToQuarantine, quarantineDir, dryRun, 0, 2, scanState);
    results.auditedProjects.push(projectAudit);
  }

  results.totalProjectsAudited = results.auditedProjects.length;
  if (results.totalProjectsAudited > 0) {
    results.overallComplianceScore = Math.round(totalScore / results.totalProjectsAudited);
  }

  return results;
}

/**
 * Scan project files for security secrets, junk files, and mislocated files.
 */
function scanProjectFiles(dirPath, results, stageJunk, quarantineDir, dryRun, currentDepth = 0, maxDepth = 2, scanState = { fileCount: 0 }) {
  if (currentDepth > maxDepth || scanState.fileCount > 100) return;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (scanState.fileCount > 100) break;
      const fullPath = path.join(dirPath, entry.name);

      // Skip symlinks to prevent circular loops
      if (entry.isSymbolicLink()) continue;

      if (IGNORE_DIRS.has(entry.name) || (entry.isDirectory() && entry.name.startsWith("."))) {
        continue;
      }

      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") {
          results.junkFilesFound.push({
            path: fullPath,
            type: "pycache_directory",
            action: dryRun ? "stage_quarantine" : "moved"
          });
          if (stageJunk && !dryRun) {
            stageToQuarantine(fullPath, quarantineDir);
          }
        } else {
          scanProjectFiles(fullPath, results, stageJunk, quarantineDir, dryRun, currentDepth + 1, maxDepth, scanState);
        }
        continue;
      }

      scanState.fileCount++;

      // Check credential files
      if (CREDENTIAL_FILENAMES.includes(entry.name)) {
        results.securityIssues.push({
          severity: "HIGH",
          file: fullPath,
          issue: `Credential file found in workspace: ${entry.name}`,
          recommendation: "Ensure this file is in .gitignore or move to local credentials vault"
        });
      }

      // Check junk patterns
      for (const pattern of JUNK_PATTERNS) {
        if (pattern.test(entry.name)) {
          results.junkFilesFound.push({
            path: fullPath,
            type: "junk_file",
            pattern: pattern.toString(),
            action: dryRun ? "stage_quarantine" : "moved"
          });
          if (stageJunk && !dryRun) {
            stageToQuarantine(fullPath, quarantineDir);
          }
          break;
        }
      }

      // Check mislocated exports in project root
      if (
        (entry.name.includes("conversations") || entry.name.startsWith("chat_export")) &&
        (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))
      ) {
        results.mislocatedExports.push({
          file: fullPath,
          recommendation: "Move to canonical Docs/ or Exports/ subdirectory"
        });
      }

      // Check for raw secret keys inside small text files (< 200KB)
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 0 && stat.size < 200 * 1024 && !entry.name.endsWith(".png") && !entry.name.endsWith(".jpg") && !entry.name.endsWith(".zip")) {
          const content = safeReadFile(fullPath, 200 * 1024);
          if (content) {
            for (const re of CREDENTIAL_PATTERNS) {
              const matches = content.match(re);
              if (matches && matches.length > 0) {
                results.securityIssues.push({
                  severity: "CRITICAL",
                  file: fullPath,
                  issue: `Found ${matches.length} exposed secret token pattern(s) in source`,
                  patternType: re.toString()
                });
                break;
              }
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Move file or dir to Quarantine timestamp folder.
 */
function stageToQuarantine(sourcePath, quarantineRoot) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const targetFolder = path.join(quarantineRoot, "staged_junk_" + timestamp);
    ensureDirSync(targetFolder);
    const dest = path.join(targetFolder, path.basename(sourcePath));
    fs.renameSync(sourcePath, dest);
  } catch (_) {}
}

/**
 * Detect primary technology stack of a directory.
 */
function detectProjectStack(dirPath) {
  if (fs.existsSync(path.join(dirPath, "package.json"))) return "Node.js / TypeScript";
  if (fs.existsSync(path.join(dirPath, "requirements.txt")) || fs.existsSync(path.join(dirPath, "pyproject.toml"))) return "Python";
  if (fs.existsSync(path.join(dirPath, "Cargo.toml"))) return "Rust";
  if (fs.existsSync(path.join(dirPath, "go.mod"))) return "Go";
  if (fs.existsSync(path.join(dirPath, "Makefile"))) return "C/C++ / Make";
  return "Docs / Multi-Stack";
}

/**
 * -----------------------------------------------------------------------------
 * 3. COWORK SPACE MANAGER
 * -----------------------------------------------------------------------------
 */
async function coworkSpaceManager(options = {}) {
  const defaultCowork = getDefaultWorkspaceRoot();
  const coworkPath = resolveHome(options.coworkPath || defaultCowork);
  const cleanTempFiles = Boolean(options.cleanTempFiles);
  const generateIndex = options.generateIndex !== false; // default true
  const defaultIndex = path.join(coworkPath, "COWORK_INDEX.md");
  const outputIndexPath = resolveHome(options.outputIndexPath || defaultIndex);
  const quarantineDir = resolveHome(options.quarantineDir || path.join(os.homedir(), "Quarantine", "cowork_temp"));
  const dryRun = options.dryRun !== false; // default true

  if (!fs.existsSync(coworkPath)) {
    throw new Error(`Cowork workspace path does not exist: ${coworkPath}`);
  }

  const results = {
    status: "success",
    coworkPath,
    activeSpacesCount: 0,
    tempFilesFound: [],
    cleanedCount: 0,
    indexPath: outputIndexPath,
    indexGenerated: false,
    dryRun,
    spaces: []
  };

  const entries = fs.readdirSync(coworkPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(coworkPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || IGNORE_DIRS.has(entry.name)) {
        if (entry.name.includes("cache") || entry.name.includes("tags")) {
          results.tempFilesFound.push({
            path: fullPath,
            reason: "Stale AI tags/cache directory"
          });
        }
        continue;
      }

      const spaceInfo = inspectCoworkSpace(fullPath);
      results.spaces.push(spaceInfo);
    } else if (entry.isFile()) {
      if (
        entry.name.endsWith(".tmp") ||
        entry.name.startsWith("temp_") ||
        entry.name === ".DS_Store" ||
        entry.name.startsWith(".aider.input.history")
      ) {
        results.tempFilesFound.push({
          path: fullPath,
          reason: "Temporary root workspace file"
        });
      }
    }
  }

  results.activeSpacesCount = results.spaces.length;

  // Clean temp files if requested
  if (cleanTempFiles && results.tempFilesFound.length > 0) {
    for (const tempItem of results.tempFilesFound) {
      if (!dryRun) {
        try {
          ensureDirSync(quarantineDir);
          const dest = path.join(quarantineDir, path.basename(tempItem.path));
          fs.renameSync(tempItem.path, dest);
          results.cleanedCount++;
        } catch (_) {}
      } else {
        results.cleanedCount++;
      }
    }
  }

  // Generate COWORK_INDEX.md
  if (generateIndex) {
    const indexMd = generateCoworkIndexMarkdown(results.spaces, coworkPath);
    try {
      ensureDirSync(path.dirname(outputIndexPath));
      fs.writeFileSync(outputIndexPath, indexMd, "utf8");
      results.indexGenerated = true;
    } catch (err) {
      results.indexGenerated = false;
      results.indexError = err.message;
    }
  }

  return results;
}

/**
 * Inspect an individual cowork project folder.
 */
function inspectCoworkSpace(spacePath) {
  const name = path.basename(spacePath);
  let stat = null;
  try { stat = fs.statSync(spacePath); } catch (_) {}
  let summary = "Active Sovereign Cowork Space";
  let primaryDoc = null;

  const docCandidates = ["README.md", "Readme.md", "Claude.md", "Structure.md", "DEPLOY.md"];
  for (const doc of docCandidates) {
    const docPath = path.join(spacePath, doc);
    if (fs.existsSync(docPath)) {
      primaryDoc = doc;
      const content = safeReadFile(docPath, 4096);
      if (content) {
        const lines = content.split("\n").filter(l => l.trim().length > 0 && !l.startsWith("#"));
        if (lines.length > 0) {
          summary = lines[0].replace(/[`*_\->]/g, "").trim().slice(0, 120);
        }
      }
      break;
    }
  }

  let subItemsCount = 0;
  try {
    subItemsCount = fs.readdirSync(spacePath).length;
  } catch (_) {}

  return {
    name,
    path: spacePath,
    summary,
    primaryDoc: primaryDoc || "None",
    stack: detectProjectStack(spacePath),
    itemsCount: subItemsCount,
    lastModified: stat ? stat.mtime.toISOString().split("T")[0] : "-"
  };
}

/**
 * Generate COWORK_INDEX.md markdown.
 */
function generateCoworkIndexMarkdown(spaces, coworkPath) {
  const dateStr = new Date().toISOString().split("T")[0];
  let md = `# 🤝 SOVEREIGN COWORK MASTER INDEX\n\n`;
  md += `> Central index of active projects, AI workspaces, and cowork repositories in \`${coworkPath}\`.\n`;
  md += `> Automatically managed by \`@axd/browser-mcp\` (v1.1.0) on **${dateStr}**.\n\n`;
  md += `## 🚀 Active Cowork Projects (${spaces.length})\n\n`;
  md += `| Space / Project | Primary Tech Stack | Primary Documentation | Last Modified | Description / Focus |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const s of spaces) {
    const cleanDesc = s.summary.replace(/\|/g, "-");
    md += `| **\`${s.name}\`** | \`${s.stack}\` | [${s.primaryDoc}](${s.name}/${s.primaryDoc}) | \`${s.lastModified}\` | ${cleanDesc} |\n`;
  }

  md += `\n## 🛠️ Canonical Architecture Rules\n\n`;
  md += `- **01_Product**: Source code and application core.\n`;
  md += `- **AI_review**: Machine evaluations, prompt specs, and test traces.\n`;
  md += `- **Human_review**: Manual checklists, approvals, and sign-offs.\n`;
  md += `- **Docs**: Architecture specs, diagrams, and deployment guides.\n`;
  md += `- **Quarantine**: Safely isolated stubs, legacy scraps, and deprecated files.\n\n`;
  md += `_Keep your workspace clean, performant, and sovereign._\n`;

  return md;
}

module.exports = {
  chatsAnalyzeAndClean,
  projectsReorganizeTree,
  coworkSpaceManager
};
