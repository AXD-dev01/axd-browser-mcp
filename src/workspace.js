/**
 * src/workspace.js — Sovereign Workspace & Universal AI Chat Intelligence Suite
 * Part of @axd/browser-mcp (v1.1.0)
 *
 * Universal AI Platform Support:
 * - Anthropic Claude (CLI/Desktop .jsonl, Claude Web export JSONs, Projects & Artifacts)
 * - OpenAI ChatGPT (Full exports, human-filtered JSONs, Gizmos & Custom GPTs)
 * - Perplexity AI (Research threads, markdown scrapes, citation mappings)
 * - Google Gemini & Antigravity (Transcript logs, JSON/Markdown exports)
 * - Local LLMs & Open-WebUI / Mistral / Ollama transcripts
 *
 * Key Capabilities:
 * 1. chatsAnalyzeAndClean: Fast multi-platform scanning, stub isolation, token counting, deduplication.
 * 2. recreateCleanTreeVault: Recreates the unified 1-tree clean directory with normalized markdown transcripts,
 *    forensic evidence preservation, patent/breakthrough tagging, and master catalogs.
 * 3. projectsReorganizeTree: Audits and enforces canonical project directory structure (01_Product, AI_review, etc.).
 * 4. coworkSpaceManager: Syncs and indexes Claude Desktop cowork workspaces (COWORK_INDEX.md).
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
 * Safely read file content with max size limit.
 */
function safeReadFile(filePath, maxBytes = 25 * 1024 * 1024) {
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
 * Sanitize filename for markdown export.
 */
function sanitizeFileName(str, fallback = "transcript") {
  if (!str) return fallback;
  const clean = str
    .replace(/[\\/:*?"<>|#\r\n\t]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 75)
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
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
 * Evidence and Patent Keyword Classifiers.
 */
const EVIDENCE_CLASSIFIERS = [
  { pattern: /patent|provisional patent|au\s*#?2026900273|lexgeneris|plunkett/i, tag: "PATENT_INTELLECTUAL_PROPERTY" },
  { pattern: /hogan|minimum jerk|motor math|bezier curve|un-bannable/i, tag: "HOGAN_BEZIER_MOTOR_MATH" },
  { pattern: /bms preservation|bacnet priority|eev\s*superheat|thermodynamic delta/i, tag: "BMS_PRESERVATION_BUS" },
  { pattern: /moat|never forget|zero-server|local-first|non-custodial/i, tag: "SOVEREIGN_LOCAL_FIRST_MOAT" },
  { pattern: /arbitrat|counsel|case\s*20249374|anthropic complaint|legal claim|negligence vault/i, tag: "LEGAL_EVIDENCE_RECORD" },
  { pattern: /safari dom bridge|nerdcore 2021|defend my build|scott schedule/i, tag: "CORE_BREAKTHROUGH_INVENTION" }
];

function detectEvidenceTags(title, text) {
  const full = ((title || "") + " " + (text || "")).toLowerCase();
  const tags = [];
  for (const c of EVIDENCE_CLASSIFIERS) {
    if (c.pattern.test(full)) {
      tags.push(c.tag);
    }
  }
  return tags;
}

/**
 * -----------------------------------------------------------------------------
 * 1. UNIVERSAL PARSERS FOR ALL AI PLATFORMS
 * -----------------------------------------------------------------------------
 */

/**
 * Parse Claude Desktop / CLI .jsonl session file.
 */
function parseClaudeSessionFile(filePath, projectName) {
  try {
    const stat = fs.statSync(filePath);
    const sessionId = path.basename(filePath, ".jsonl");

    if (stat.size === 0) {
      return {
        sessionId,
        platform: "Claude Desktop/CLI",
        source: "Claude CLI / Desktop",
        account: "Local CLI",
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
        promptHash: null,
        evidenceTags: [],
        messages: []
      };
    }

    const content = safeReadFile(filePath, 5 * 1024 * 1024);
    if (!content) {
      return {
        sessionId,
        platform: "Claude Desktop/CLI",
        source: "Claude CLI / Desktop",
        account: "Local CLI",
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
        promptHash: null,
        evidenceTags: [],
        messages: []
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
    const messages = [];

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

        if (record.type === "user" || record.role === "user" || (record.message && record.message.role === "user")) {
          userMessages++;
          isErrorOnly = false;
          let pText = "";
          if (typeof record.content === "string") pText = record.content;
          else if (typeof record.message?.content === "string") pText = record.message.content;
          else if (Array.isArray(record.content)) {
            pText = record.content.map(c => (typeof c === "string" ? c : c.text || "")).join(" ");
          }
          const cleanP = pText.replace(/<persisted-output>[\s\S]*?<\/persisted-output>/g, "").trim();
          if (!firstPrompt) firstPrompt = (cleanP || pText).slice(0, 300);

          messages.push({
            role: "user",
            text: pText,
            timestamp: record.timestamp || null
          });
        }

        if (record.type === "assistant" || record.role === "assistant" || (record.message && record.message.role === "assistant")) {
          assistantMessages++;
          isErrorOnly = false;
          let aText = "";
          if (typeof record.content === "string") aText = record.content;
          else if (typeof record.message?.content === "string") aText = record.message.content;
          else if (Array.isArray(record.content)) {
            aText = record.content.map(c => (typeof c === "string" ? c : c.text || "")).join(" ");
          }
          messages.push({
            role: "assistant",
            text: aText,
            timestamp: record.timestamp || null
          });
        }

        if (record.type === "tool_use" || record.toolUseID) {
          toolCalls++;
          messages.push({
            role: "tool",
            text: `Tool: ${record.toolName || record.toolUseID || "Action"}`,
            timestamp: record.timestamp || null
          });
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
    const evidenceTags = detectEvidenceTags(normalizedTitle, content.slice(0, 5000));

    return {
      sessionId,
      platform: "Claude Desktop/CLI",
      source: "Claude CLI / Desktop",
      account: "Local CLI",
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
      promptHash,
      evidenceTags,
      messages
    };
  } catch (err) {
    return null;
  }
}

/**
 * Parse Claude Web export JSON (e.g. conversations_COMPLETE_415_20260815.json).
 */
function parseClaudeWebExportFile(filePath, limit = Infinity) {
  const results = [];
  try {
    const raw = safeReadFile(filePath, 50 * 1024 * 1024);
    if (!raw) return results;
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return results;

    for (const conv of json.slice(0, limit)) {
      const sessionId = conv.uuid || crypto.randomUUID();
      const title = conv.name || "Claude Web Conversation";
      let userMessages = 0;
      let assistantMessages = 0;
      let firstPrompt = "";
      const messages = [];
      let fullText = "";

      if (Array.isArray(conv.chat_messages)) {
        for (const msg of conv.chat_messages) {
          const sender = msg.sender === "human" ? "user" : "assistant";
          if (sender === "user") {
            userMessages++;
            if (!firstPrompt && msg.text) firstPrompt = msg.text.slice(0, 300);
          } else {
            assistantMessages++;
          }
          const text = msg.text || "";
          fullText += " " + text;
          messages.push({
            role: sender,
            text,
            timestamp: msg.created_at || null,
            attachments: msg.attachments || []
          });
        }
      }

      const totalTokens = Math.round((userMessages + assistantMessages) * 350);
      const isStub = userMessages === 0 || messages.length === 0;
      const createdDate = conv.created_at ? new Date(conv.created_at).toISOString() : new Date().toISOString();
      const updatedDate = conv.updated_at ? new Date(conv.updated_at).toISOString() : createdDate;
      const evidenceTags = detectEvidenceTags(title, fullText.slice(0, 5000));
      const promptHash = firstPrompt ? hashString(firstPrompt.trim().toLowerCase()) : null;

      results.push({
        sessionId,
        platform: "Anthropic Claude",
        source: "Claude Web Export",
        account: "claude-diego",
        project: conv.project_uuid ? `Project_${conv.project_uuid.slice(0, 8)}` : "General",
        filePath,
        fileSize: JSON.stringify(conv).length,
        title,
        firstPrompt,
        userMessages,
        assistantMessages,
        toolCalls: 0,
        estimatedTokens: totalTokens,
        createdDate,
        updatedDate,
        isStub,
        stubReason: isStub ? "Empty web chat" : null,
        promptHash,
        evidenceTags,
        messages
      });
    }
  } catch (_) {}
  return results;
}

/**
 * Parse OpenAI conversations.json or human JSON exports.
 */
function parseOpenAiExportFile(filePath, limit = Infinity, accountName = "ChatGPT Archive") {
  const results = [];
  try {
    const raw = safeReadFile(filePath, 90 * 1024 * 1024);
    if (!raw) return results;
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return results;

    for (const conv of json.slice(0, limit)) {
      const sessionId = conv.id || conv.conversation_id || crypto.randomUUID();
      const title = conv.title || "ChatGPT Conversation";
      let userMessages = 0;
      let assistantMessages = 0;
      let firstPrompt = "";
      const messages = [];
      let fullText = "";

      if (conv.mapping) {
        // Topological sort / mapping traversal
        for (const key of Object.keys(conv.mapping)) {
          const node = conv.mapping[key];
          if (node && node.message) {
            const role = node.message.author?.role === "user" ? "user" : (node.message.author?.role === "assistant" ? "assistant" : "system");
            let text = "";
            if (node.message.content?.parts) {
              text = node.message.content.parts.filter(p => typeof p === "string").join("\n");
            }
            if (role === "user") {
              userMessages++;
              if (!firstPrompt && text) firstPrompt = text.slice(0, 300);
            } else if (role === "assistant") {
              assistantMessages++;
            }
            fullText += " " + text;
            messages.push({
              role,
              text,
              timestamp: node.message.create_time ? new Date(node.message.create_time * 1000).toISOString() : null
            });
          }
        }
      } else if (Array.isArray(conv.messages)) {
        for (const m of conv.messages) {
          const role = m.role || (m.author?.role === "user" ? "user" : "assistant");
          const text = typeof m.content === "string" ? m.content : (m.content?.parts?.join("\n") || "");
          if (role === "user") {
            userMessages++;
            if (!firstPrompt && text) firstPrompt = text.slice(0, 300);
          } else if (role === "assistant") {
            assistantMessages++;
          }
          fullText += " " + text;
          messages.push({ role, text, timestamp: m.timestamp || null });
        }
      }

      const totalTokens = Math.round((userMessages + assistantMessages) * 280);
      const createdDate = conv.create_time ? new Date(conv.create_time * 1000).toISOString() : new Date().toISOString();
      const updatedDate = conv.update_time ? new Date(conv.update_time * 1000).toISOString() : createdDate;
      const isStub = userMessages === 0 || messages.length === 0;
      const evidenceTags = detectEvidenceTags(title, fullText.slice(0, 5000));
      const promptHash = firstPrompt ? hashString(firstPrompt.trim().toLowerCase()) : null;

      results.push({
        sessionId,
        platform: "OpenAI ChatGPT",
        source: "ChatGPT Export",
        account: accountName,
        project: "ChatGPT",
        filePath,
        fileSize: JSON.stringify(conv).length,
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
        promptHash,
        evidenceTags,
        messages
      });
    }
  } catch (_) {}
  return results;
}

/**
 * Parse Perplexity exports or markdown threads.
 */
function parsePerplexityExportFile(filePath) {
  const results = [];
  try {
    const raw = safeReadFile(filePath, 10 * 1024 * 1024);
    if (!raw) return results;
    const stat = fs.statSync(filePath);
    const sessionId = path.basename(filePath, path.extname(filePath));

    let title = "Perplexity Research Thread";
    const messages = [];

    if (filePath.endsWith(".json")) {
      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const itemTitle = item.title || item.query || "Perplexity Query";
        results.push({
          sessionId: item.id || sessionId,
          platform: "Perplexity AI",
          source: "Perplexity Research Scrape",
          account: "Perplexity",
          project: "Perplexity Research",
          filePath,
          fileSize: stat.size,
          title: itemTitle,
          firstPrompt: item.query || itemTitle,
          userMessages: 1,
          assistantMessages: 1,
          toolCalls: 0,
          estimatedTokens: Math.round(raw.length / 4),
          createdDate: item.created_at || stat.mtime.toISOString(),
          updatedDate: item.updated_at || stat.mtime.toISOString(),
          isStub: false,
          stubReason: null,
          promptHash: hashString((item.query || itemTitle).toLowerCase()),
          evidenceTags: detectEvidenceTags(itemTitle, raw.slice(0, 5000)),
          messages: [
            { role: "user", text: item.query || itemTitle },
            { role: "assistant", text: item.answer || item.response || JSON.stringify(item) }
          ]
        });
      }
    } else if (filePath.endsWith(".md")) {
      const lines = raw.split("\n");
      if (lines[0] && lines[0].startsWith("#")) title = lines[0].replace(/^#+\s*/, "").trim();
      results.push({
        sessionId,
        platform: "Perplexity AI",
        source: "Perplexity Markdown Export",
        account: "Perplexity",
        project: "Perplexity Research",
        filePath,
        fileSize: stat.size,
        title,
        firstPrompt: title,
        userMessages: 1,
        assistantMessages: 1,
        toolCalls: 0,
        estimatedTokens: Math.round(raw.length / 4),
        createdDate: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
        updatedDate: stat.mtime.toISOString(),
        isStub: false,
        stubReason: null,
        promptHash: hashString(title.toLowerCase()),
        evidenceTags: detectEvidenceTags(title, raw.slice(0, 5000)),
        messages: [{ role: "user", text: title }, { role: "assistant", text: raw }]
      });
    }
  } catch (_) {}
  return results;
}

/**
 * -----------------------------------------------------------------------------
 * 2. RECREATE 1 CLEAN TREE DIRECTORY (EVIDENCE VAULT & NORMALIZED CHATS)
 * -----------------------------------------------------------------------------
 */
async function recreateCleanTreeVault(options = {}) {
  const defaultVault = path.join(os.homedir(), "Claude", "AI_EVIDENCE_VAULT");
  const vaultRoot = resolveHome(options.evidenceVaultPath || defaultVault);
  const limitPerSource = typeof options.limitPerSource === "number" ? options.limitPerSource : 500;
  const dryRun = options.dryRun !== false; // default true

  const results = {
    status: "success",
    vaultRoot,
    dryRun,
    totalIndexedAcrossAllPlatforms: 0,
    platformBreakdown: {},
    evidenceItemsCount: 0,
    duplicateClustersCount: 0,
    generatedTranscriptsCount: 0,
    catalogsGenerated: [],
    evidenceRegister: []
  };

  const allSessions = [];
  const promptHashMap = new Map();

  // 1. Ingest Claude Desktop / CLI transcripts
  const claudeCliDir = path.join(os.homedir(), ".claude", "projects");
  if (fs.existsSync(claudeCliDir)) {
    try {
      const pEntries = fs.readdirSync(claudeCliDir, { withFileTypes: true });
      for (const p of pEntries) {
        const pPath = path.join(claudeCliDir, p.name);
        if (p.isDirectory()) {
          const files = fs.readdirSync(pPath).filter(f => f.endsWith(".jsonl"));
          for (const f of files.slice(0, limitPerSource)) {
            const item = parseClaudeSessionFile(path.join(pPath, f), p.name);
            if (item) allSessions.push(item);
          }
        }
      }
    } catch (_) {}
  }

  // 2. Ingest Claude Web Exports
  const claudeWebPath = path.join(os.homedir(), "Downloads", "sovereign_scrape", "claude-diego", "conversations_COMPLETE_415_20260815.json");
  if (fs.existsSync(claudeWebPath)) {
    const webItems = parseClaudeWebExportFile(claudeWebPath, limitPerSource);
    webItems.forEach(i => allSessions.push(i));
  }

  // 3. Ingest OpenAI Exports
  const openAiSources = [
    { path: path.join(os.homedir(), "Downloads", "sovereign_scrape", "chatgpt-diego", "conversations_human.json"), account: "ChatGPT Diego (Human)" },
    { path: path.join(os.homedir(), "Downloads", "sovereign_scrape", "chatgpt-axd-hotmail", "conversations.json"), account: "ChatGPT Hotmail" },
    { path: path.join(os.homedir(), "Downloads", "sovereign_scrape", "chatgpt-axd-gmail", "conversations.json"), account: "ChatGPT Gmail" },
    { path: path.join(os.homedir(), "Downloads", "sovereign_scrape", "chatgpt-diegonanini23-pre-reorg-20260818T160425Z-v3", "conversations_visible_v2.json"), account: "ChatGPT Diego v3" }
  ];

  for (const src of openAiSources) {
    if (fs.existsSync(src.path)) {
      const items = parseOpenAiExportFile(src.path, limitPerSource, src.account);
      items.forEach(i => allSessions.push(i));
    }
  }

  // 4. Ingest Perplexity Scrapes / Gemini / Antigravity files
  const perplexityDir = path.join(os.homedir(), "§00_AXD_Sovereign_empire", "§01_AXD_Ghost_MCP_platform", "Main");
  if (fs.existsSync(perplexityDir)) {
    try {
      const pFiles = fs.readdirSync(perplexityDir).filter(f => f.includes("perplexity") && (f.endsWith(".json") || f.endsWith(".md")));
      for (const pf of pFiles) {
        const pItems = parsePerplexityExportFile(path.join(perplexityDir, pf));
        pItems.forEach(i => allSessions.push(i));
      }
    } catch (_) {}
  }

  // 5. Ingest Antigravity & Gemini Code markdown files
  const downloadsDir = path.join(os.homedir(), "Downloads");
  if (fs.existsSync(downloadsDir)) {
    try {
      const dFiles = fs.readdirSync(downloadsDir).filter(f => f.startsWith("gemini-") && f.endsWith(".md"));
      for (const gf of dFiles) {
        const gItems = parsePerplexityExportFile(path.join(downloadsDir, gf));
        gItems.forEach(i => {
          i.platform = "Google Gemini";
          allSessions.push(i);
        });
      }
    } catch (_) {}
  }

  // Process all sessions into unified registry and cluster duplicates
  for (const s of allSessions) {
    results.totalIndexedAcrossAllPlatforms++;
    results.platformBreakdown[s.platform] = (results.platformBreakdown[s.platform] || 0) + 1;

    if (s.evidenceTags && s.evidenceTags.length > 0) {
      results.evidenceItemsCount++;
      results.evidenceRegister.push({
        sessionId: s.sessionId,
        platform: s.platform,
        account: s.account,
        title: s.title,
        tags: s.evidenceTags,
        createdDate: s.createdDate,
        filePath: s.filePath
      });
    }

    if (s.promptHash && !s.isStub) {
      if (!promptHashMap.has(s.promptHash)) {
        promptHashMap.set(s.promptHash, []);
      }
      promptHashMap.get(s.promptHash).push(s);
    }
  }

  // Compute duplicate clusters
  const duplicateClusters = [];
  for (const [hash, group] of promptHashMap.entries()) {
    if (group.length > 1) {
      duplicateClusters.push({
        promptHash: hash,
        count: group.length,
        promptPreview: group[0].firstPrompt ? group[0].firstPrompt.slice(0, 140) : group[0].title,
        sessions: group.map(g => ({
          sessionId: g.sessionId,
          platform: g.platform,
          account: g.account,
          date: g.createdDate.split("T")[0],
          title: g.title
        }))
      });
    }
  }
  results.duplicateClustersCount = duplicateClusters.length;

  // 6. Materialize 1 Clean Tree Directory Structure (if not dryRun or preview write)
  if (!dryRun) {
    ensureDirSync(vaultRoot);
    const dirs = [
      path.join(vaultRoot, "00_MASTER_INDEX"),
      path.join(vaultRoot, "01_Anthropic_Claude", "Web_Conversations"),
      path.join(vaultRoot, "01_Anthropic_Claude", "CLI_and_Desktop_Sessions"),
      path.join(vaultRoot, "02_OpenAI_ChatGPT", "Personal_Diego"),
      path.join(vaultRoot, "02_OpenAI_ChatGPT", "Hotmail_Archive"),
      path.join(vaultRoot, "02_OpenAI_ChatGPT", "Gmail_Archive"),
      path.join(vaultRoot, "03_Perplexity_AI"),
      path.join(vaultRoot, "04_Google_Gemini_Antigravity"),
      path.join(vaultRoot, "05_Forensic_Evidence_Extracts"),
      path.join(vaultRoot, "06_Quarantine_Stubs")
    ];
    dirs.forEach(ensureDirSync);

    // Write Master Markdown Catalogs
    const masterCatalogMd = generateUniversalMasterCatalogMarkdown(allSessions, results.platformBreakdown, duplicateClusters.length, results.evidenceItemsCount);
    const masterDuplicateMd = generateMasterDuplicateLedgerMarkdown(duplicateClusters);
    const masterEvidenceMd = generateMasterEvidenceRegisterMarkdown(results.evidenceRegister);

    fs.writeFileSync(path.join(vaultRoot, "00_MASTER_INDEX", "MASTER_AI_CATALOG.md"), masterCatalogMd, "utf8");
    fs.writeFileSync(path.join(vaultRoot, "00_MASTER_INDEX", "MASTER_DUPLICATE_LEDGER.md"), masterDuplicateMd, "utf8");
    fs.writeFileSync(path.join(vaultRoot, "00_MASTER_INDEX", "MASTER_EVIDENCE_REGISTER.md"), masterEvidenceMd, "utf8");

    results.catalogsGenerated.push(
      path.join(vaultRoot, "00_MASTER_INDEX", "MASTER_AI_CATALOG.md"),
      path.join(vaultRoot, "00_MASTER_INDEX", "MASTER_DUPLICATE_LEDGER.md"),
      path.join(vaultRoot, "00_MASTER_INDEX", "MASTER_EVIDENCE_REGISTER.md")
    );

    // Export top / evidence normalized markdown transcripts
    for (const session of allSessions) {
      if (session.isStub) continue;
      let targetSubDir = path.join(vaultRoot, "01_Anthropic_Claude", "CLI_and_Desktop_Sessions");
      if (session.platform === "Anthropic Claude") {
        targetSubDir = path.join(vaultRoot, "01_Anthropic_Claude", "Web_Conversations");
      } else if (session.platform === "OpenAI ChatGPT") {
        if (session.account.includes("Hotmail")) targetSubDir = path.join(vaultRoot, "02_OpenAI_ChatGPT", "Hotmail_Archive");
        else if (session.account.includes("Gmail")) targetSubDir = path.join(vaultRoot, "02_OpenAI_ChatGPT", "Gmail_Archive");
        else targetSubDir = path.join(vaultRoot, "02_OpenAI_ChatGPT", "Personal_Diego");
      } else if (session.platform === "Perplexity AI") {
        targetSubDir = path.join(vaultRoot, "03_Perplexity_AI");
      } else if (session.platform === "Google Gemini") {
        targetSubDir = path.join(vaultRoot, "04_Google_Gemini_Antigravity");
      }

      const cleanName = sanitizeFileName(session.title, session.sessionId);
      const outPath = path.join(targetSubDir, `${session.createdDate.split("T")[0]}_${cleanName}_${session.sessionId.slice(0, 8)}.md`);

      const mdContent = generateNormalizedTranscriptMarkdown(session);
      try {
        fs.writeFileSync(outPath, mdContent, "utf8");
        results.generatedTranscriptsCount++;

        // If high-value evidence, also link into 05_Forensic_Evidence_Extracts
        if (session.evidenceTags && session.evidenceTags.length > 0) {
          const evidenceOutPath = path.join(vaultRoot, "05_Forensic_Evidence_Extracts", `${session.evidenceTags[0]}_${cleanName}_${session.sessionId.slice(0, 8)}.md`);
          fs.writeFileSync(evidenceOutPath, mdContent, "utf8");
        }
      } catch (_) {}
    }
  }

  return results;
}

/**
 * Generate normalized Markdown transcript.
 */
function generateNormalizedTranscriptMarkdown(session) {
  let md = `---
title: "${(session.title || "Untitled").replace(/"/g, '\\"')}"
platform: "${session.platform}"
account: "${session.account}"
sessionId: "${session.sessionId}"
createdDate: "${session.createdDate}"
updatedDate: "${session.updatedDate}"
estimatedTokens: ${session.estimatedTokens}
evidenceTags: [${(session.evidenceTags || []).map(t => `"${t}"`).join(", ")}]
promptHash: "${session.promptHash || ""}"
originalFile: "${session.filePath}"
---

# 💬 ${(session.title || "Untitled").replace(/[\r\n]+/g, " ")}

> **Platform:** \`${session.platform}\` | **Account/Space:** \`${session.account}\` | **Date:** \`${session.createdDate.split("T")[0]}\`  
> **Estimated Tokens:** \`${session.estimatedTokens.toLocaleString()}\` | **Evidence Tags:** \`${(session.evidenceTags || []).join(", ") || "None"}\`

---

`;

  if (session.messages && session.messages.length > 0) {
    for (const m of session.messages) {
      const roleIcon = m.role === "user" ? "👤 User" : (m.role === "assistant" ? "🤖 Assistant" : "🛠️ System / Tool");
      md += `## ${roleIcon}\n\n${m.text || "_[No content]_"}\n\n`;
      if (m.attachments && m.attachments.length > 0) {
        md += `_Attachments: ${m.attachments.map(a => a.file_name || a.title || "File").join(", ")}_\n\n`;
      }
      md += `---\n\n`;
    }
  } else if (session.firstPrompt) {
    md += `## 👤 User\n\n${session.firstPrompt}\n\n---\n\n`;
  }

  return md;
}

/**
 * Generate Universal Master AI Catalog.
 */
function generateUniversalMasterCatalogMarkdown(sessions, breakdown, duplicateCount, evidenceCount) {
  const dateStr = new Date().toISOString().split("T")[0];
  let md = `# 🌐 UNIVERSAL MASTER AI CHAT & EVIDENCE CATALOG\n\n`;
  md += `> Comprehensive unified index across **Anthropic Claude**, **OpenAI ChatGPT**, **Perplexity AI**, and **Google Gemini**.\n`;
  md += `> Generated on **${dateStr}** by \`@axd/browser-mcp\` (v1.1.0).\n\n`;

  md += `## 📊 Multi-Platform Overview\n\n`;
  md += `| Platform / Ecosystem | Indexed Sessions |\n`;
  md += `| :--- | :--- |\n`;
  for (const [p, count] of Object.entries(breakdown)) {
    md += `| **${p}** | \`${count}\` conversations |\n`;
  }
  md += `| **Total Universal Index** | \`$${sessions.length}\` |\n`;
  md += `| **Forensic Evidence & Breakthrough Items** | \`${evidenceCount}\` |\n`;
  md += `| **Identified Duplicate Clusters** | \`${duplicateCount}\` |\n\n`;

  md += `## 🗂️ Universal Conversation Stream\n\n`;
  md += `| Date | Platform | Account / Source | Title / Topic | Messages | Est. Tokens | Tags |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  const valid = sessions.filter(s => !s.isStub).sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
  for (const s of valid.slice(0, 150)) {
    const cleanTitle = (s.title || "Untitled").replace(/\|/g, "-").slice(0, 55);
    const msgs = `${s.userMessages}u / ${s.assistantMessages}a`;
    const tokens = s.estimatedTokens ? s.estimatedTokens.toLocaleString() : "0";
    const tagStr = (s.evidenceTags && s.evidenceTags.length > 0) ? `\`${s.evidenceTags[0]}\`` : "-";
    md += `| ${s.createdDate.split("T")[0]} | \`${s.platform}\` | \`${s.account}\` | ${cleanTitle} | ${msgs} | ${tokens} | ${tagStr} |\n`;
  }

  if (valid.length > 150) {
    md += `\n_... and ${valid.length - 150} more conversations indexed in the universal vault._\n\n`;
  }

  return md;
}

/**
 * Generate Master Duplicate Ledger.
 */
function generateMasterDuplicateLedgerMarkdown(clusters) {
  let md = `# 🔁 MASTER DUPLICATE & REDUNDANT CONVERSATION LEDGER\n\n`;
  md += `Identified **${clusters.length}** cross-platform duplicate prompt clusters.\n\n`;

  clusters.forEach((c, idx) => {
    md += `### Cluster #${idx + 1} (${c.count} duplicate sessions)\n`;
    md += `> **Anchor User Prompt:** _"${c.promptPreview.replace(/[\r\n]+/g, " ")}"_\n\n`;
    md += `| Platform | Account | Date | Title |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    c.sessions.forEach(s => {
      md += `| \`${s.platform}\` | \`${s.account}\` | ${s.date} | ${s.title.slice(0, 50)} |\n`;
    });
    md += `\n`;
  });

  return md;
}

/**
 * Generate Master Evidence Register.
 */
function generateMasterEvidenceRegisterMarkdown(evidence) {
  let md = `# 🛡️ MASTER FORENSIC EVIDENCE & PATENT REGISTER\n\n`;
  md += `> Classified **${evidence.length}** conversations and technical records containing patent claims, motor math, BMS breakthroughs, or legal artifacts.\n\n`;
  md += `| Classification Tag | Platform | Date | Title / Topic | Session ID |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const e of evidence) {
    const cleanTitle = (e.title || "Untitled").replace(/\|/g, "-").slice(0, 60);
    const tag = (e.tags || []).join(", ");
    md += `| **\`${tag}\`** | \`${e.platform}\` | ${e.createdDate.split("T")[0]} | ${cleanTitle} | \`${e.sessionId.slice(0, 8)}\` |\n`;
  }

  return md;
}

/**
 * -----------------------------------------------------------------------------
 * 3. CHATS ANALYZE AND CLEAN (UPGRADED UNIVERSAL SCAN)
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
  const dryRun = options.dryRun !== false;
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
  const promptHashMap = new Map();

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

  // 2. Scan OpenAI exports if requested or specified
  const openAiPaths = [];
  if (openAiExportPath && fs.existsSync(openAiExportPath)) {
    openAiPaths.push(openAiExportPath);
  } else if (options.autoDiscoverOpenAi === true) {
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

  // Process sessions
  for (const session of sessions) {
    results.totalSessionsScanned++;
    results.totalFileSizeBytes += session.fileSize || 0;
    results.totalMessagesCount += (session.userMessages + session.assistantMessages);
    results.totalEstimatedTokens += session.estimatedTokens || 0;

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

    if (session.promptHash && !session.isStub) {
      if (!promptHashMap.has(session.promptHash)) {
        promptHashMap.set(session.promptHash, []);
      }
      promptHashMap.get(session.promptHash).push(session);
    }

    results.chats.push(session);
  }

  // Find duplicate clusters
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

  // Generate Master Chat Catalog Markdown
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
 * 4. PROJECTS REORGANIZE TREE
 * -----------------------------------------------------------------------------
 */
const CANONICAL_STRUCTURE = ["01_Product", "AI_review", "Human_review", "Docs", "Quarantine"];
const CREDENTIAL_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
  /xoxb-[a-zA-Z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z\-_]{35}/g
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
  const dryRun = options.dryRun !== false;

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

function scanProjectFiles(dirPath, results, stageJunk, quarantineDir, dryRun, currentDepth = 0, maxDepth = 2, scanState = { fileCount: 0 }) {
  if (currentDepth > maxDepth || scanState.fileCount > 100) return;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (scanState.fileCount > 100) break;
      const fullPath = path.join(dirPath, entry.name);

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

      if (CREDENTIAL_FILENAMES.includes(entry.name)) {
        results.securityIssues.push({
          severity: "HIGH",
          file: fullPath,
          issue: `Credential file found in workspace: ${entry.name}`,
          recommendation: "Ensure this file is in .gitignore or move to local credentials vault"
        });
      }

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

      if (
        (entry.name.includes("conversations") || entry.name.startsWith("chat_export")) &&
        (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))
      ) {
        results.mislocatedExports.push({
          file: fullPath,
          recommendation: "Move to canonical Docs/ or Exports/ subdirectory"
        });
      }

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

function stageToQuarantine(sourcePath, quarantineRoot) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const targetFolder = path.join(quarantineRoot, "staged_junk_" + timestamp);
    ensureDirSync(targetFolder);
    const dest = path.join(targetFolder, path.basename(sourcePath));
    fs.renameSync(sourcePath, dest);
  } catch (_) {}
}

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
 * 5. COWORK SPACE MANAGER
 * -----------------------------------------------------------------------------
 */
async function coworkSpaceManager(options = {}) {
  const defaultCowork = getDefaultWorkspaceRoot();
  const coworkPath = resolveHome(options.coworkPath || defaultCowork);
  const cleanTempFiles = Boolean(options.cleanTempFiles);
  const generateIndex = options.generateIndex !== false;
  const defaultIndex = path.join(coworkPath, "COWORK_INDEX.md");
  const outputIndexPath = resolveHome(options.outputIndexPath || defaultIndex);
  const quarantineDir = resolveHome(options.quarantineDir || path.join(os.homedir(), "Quarantine", "cowork_temp"));
  const dryRun = options.dryRun !== false;

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
  recreateCleanTreeVault,
  projectsReorganizeTree,
  coworkSpaceManager
};
