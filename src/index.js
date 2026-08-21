#!/usr/bin/env node
/**
 * @axd/browser-mcp — Sovereign High-Speed Browser & Workspace Intelligence MCP Server
 * Model Context Protocol (MCP) compliant standard server.
 * Compatible with Claude Desktop, Cursor, Windsurf, OpenCode, and any MCP Client.
 */

const readline = require("readline");
const { BrowserSession } = require("./cdp");
const { chatsAnalyzeAndClean, recreateCleanTreeVault, projectsReorganizeTree, coworkSpaceManager } = require("./workspace");

let session = null;

async function getSession() {
  if (!session) {
    session = new BrowserSession({ headless: true });
    await session.init();
  }
  return session;
}

const TOOLS = [
  // ─── BROWSER ENGINE TOOLS ───
  {
    name: "browser_navigate",
    description: "Navigate to a URL using sovereign stealth CDP (bypasses Cloudflare & bot checks)",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL to navigate to" },
        waitMs: { type: "number", description: "Optional milliseconds to wait after navigation (default 3000)" }
      },
      required: ["url"]
    }
  },
  {
    name: "browser_click",
    description: "Click a DOM element using human-cadence Bezier curve trajectory",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of element to click (e.g. 'button.submit', '#login')" }
      },
      required: ["selector"]
    }
  },
  {
    name: "browser_type",
    description: "Type text into an input element with realistic human keystroke intervals",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of input element" },
        text: { type: "string", description: "Text string to type" },
        clearFirst: { type: "boolean", description: "Whether to clear existing text before typing (default true)" }
      },
      required: ["selector", "text"]
    }
  },
  {
    name: "browser_press_key",
    description: "Press a keyboard key (Enter, Tab, Escape, Backspace, ArrowDown, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key name to press, e.g. 'Enter', 'Tab', 'Escape'" }
      },
      required: ["key"]
    }
  },
  {
    name: "browser_scroll",
    description: "Scroll the page vertically using smooth wheel events",
    inputSchema: {
      type: "object",
      properties: {
        deltaY: { type: "number", description: "Pixels to scroll (positive for down, negative for up, default 300)" }
      }
    }
  },
  {
    name: "browser_screenshot",
    description: "Capture a high-resolution screenshot of the current page viewport or full page",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: { type: "boolean", description: "Whether to capture the entire scrollable page (default false)" }
      }
    }
  },
  {
    name: "browser_extract",
    description: "Extract clean page title, URL, full text content, and links in <10ms without vision tokens",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "browser_evaluate",
    description: "Execute arbitrary JavaScript inside the page and return evaluated value",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "JavaScript expression to evaluate" }
      },
      required: ["expression"]
    }
  },

  // ─── WORKSPACE & CHAT INTELLIGENCE SUITE ───
  {
    name: "chats_analyze_and_clean",
    description: "Scans ~/.claude/projects/ & OpenAI exports, deduplicates threads, flags stubs/broken chats, and generates MASTER_CHAT_CATALOG.md",
    inputSchema: {
      type: "object",
      properties: {
        projectsDir: { type: "string", description: "Path to Claude projects directory (defaults to ~/.claude/projects)" },
        openAiExportPath: { type: "string", description: "Optional path to OpenAI conversations.json export file" },
        outputCatalogPath: { type: "string", description: "Output path for MASTER_CHAT_CATALOG.md (defaults to ~/Claude/MASTER_CHAT_CATALOG.md)" },
        quarantineDir: { type: "string", description: "Directory to stage broken/stub transcripts to (defaults to ~/Quarantine/chat_stubs)" },
        cleanStubs: { type: "boolean", description: "Whether to stage/move detected stub files to quarantine (default false)" },
        dryRun: { type: "boolean", description: "Preview actions without moving files (default true)" },
        limit: { type: "number", description: "Maximum number of sessions to scan" },
        searchQuery: { type: "string", description: "Optional search query to filter conversations by topic or content" }
      }
    }
  },
  {
    name: "projects_reorganize_tree",
    description: "Audits workspace and project trees, checks canonical structure (01_Product, AI_review, Human_review, Docs, Quarantine), flags leaked credentials & junk, and safely stages junk to ~/Quarantine/",
    inputSchema: {
      type: "object",
      properties: {
        targetDir: { type: "string", description: "Root directory of projects to audit (defaults to ~/§00_AXD_Sovereign_empire or ~/Claude)" },
        canonicalDirs: {
          type: "array",
          items: { type: "string" },
          description: "Canonical subdirectories to enforce (defaults to ['01_Product', 'AI_review', 'Human_review', 'Docs', 'Quarantine'])"
        },
        enforceCanonical: { type: "boolean", description: "Create missing canonical directories in projects (default false)" },
        stageJunkToQuarantine: { type: "boolean", description: "Stage detected junk files (.pyc, __pycache__, .DS_Store) to quarantine (default false)" },
        quarantineDir: { type: "string", description: "Quarantine staging root (defaults to ~/Quarantine)" },
        dryRun: { type: "boolean", description: "Preview changes without moving files or creating directories (default true)" }
      }
    }
  },
  {
    name: "cowork_space_manager",
    description: "Manages Claude Desktop coworkUserFilesPath (~/Claude / Sovereign Empire), cleans stale cowork temp files, and builds the master COWORK_INDEX.md cross-linking active spaces",
    inputSchema: {
      type: "object",
      properties: {
        coworkPath: { type: "string", description: "Path to cowork root directory (defaults to ~/§00_AXD_Sovereign_empire or ~/Claude)" },
        cleanTempFiles: { type: "boolean", description: "Clean up stale temporary files (.tmp, .aider cache, .DS_Store) (default false)" },
        generateIndex: { type: "boolean", description: "Generate and write COWORK_INDEX.md (default true)" },
        outputIndexPath: { type: "string", description: "Target path for COWORK_INDEX.md (defaults to coworkPath/COWORK_INDEX.md)" },
        quarantineDir: { type: "string", description: "Quarantine directory for temp files (defaults to ~/Quarantine/cowork_temp)" },
        dryRun: { type: "boolean", description: "Preview changes without moving files (default true)" }
      }
    }
  },
  {
    name: "ai_evidence_vault_recreate",
    description: "Deep analyzes conversations across all AI platforms (Claude, ChatGPT, Perplexity, Gemini) and recreates 1 unified clean-tree evidence directory with normalized markdown transcripts, patent/breakthrough tagging, and master catalogs",
    inputSchema: {
      type: "object",
      properties: {
        evidenceVaultPath: { type: "string", description: "Target directory for the recreated evidence vault (defaults to ~/Claude/AI_EVIDENCE_VAULT)" },
        limitPerSource: { type: "number", description: "Max items to ingest per platform archive (defaults to 500)" },
        dryRun: { type: "boolean", description: "Preview counts without writing files (defaults to false)" }
      }
    }
  }
];

async function handleCall(name, args) {
  // Route workspace intelligence tools without launching Chrome
  switch (name) {
    case "chats_analyze_and_clean":
      return await chatsAnalyzeAndClean(args);
    case "ai_evidence_vault_recreate":
      return await recreateCleanTreeVault(args);
    case "projects_reorganize_tree":
      return await projectsReorganizeTree(args);
    case "cowork_space_manager":
      return await coworkSpaceManager(args);
  }

  // Route browser tools via CDP session
  const s = await getSession();
  switch (name) {
    case "browser_navigate":
      return await s.navigate(args.url, args.waitMs);
    case "browser_click":
      return await s.click(args.selector);
    case "browser_type":
      return await s.type(args.selector, args.text, args.clearFirst);
    case "browser_press_key":
      return await s.pressKey(args.key);
    case "browser_scroll":
      return await s.scroll(args.deltaY);
    case "browser_screenshot":
      return await s.screenshot(args.fullPage);
    case "browser_extract":
      return await s.extractContent();
    case "browser_evaluate":
      return await s.evaluate(args.expression);
    default:
      throw new Error("Unknown tool: " + name);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === "tools/list") {
      const resp = { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      console.log(JSON.stringify(resp));
    } else if (method === "tools/call") {
      try {
        const result = await handleCall(params.name, params.arguments || {});
        const resp = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          }
        };
        console.log(JSON.stringify(resp));
      } catch (err) {
        const resp = {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: err.message }
        };
        console.log(JSON.stringify(resp));
      }
    } else if (method === "initialize") {
      const resp = {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "@axd/browser-mcp", version: "1.1.0" }
        }
      };
      console.log(JSON.stringify(resp));
    } else if (method === "ping") {
      console.log(JSON.stringify({ jsonrpc: "2.0", id, result: {} }));
    } else if (method === "resources/list" || method === "prompts/list") {
      console.log(JSON.stringify({ jsonrpc: "2.0", id, result: { resources: [], prompts: [] } }));
    } else {
      console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } }));
    }
  } catch (e) {
    // Malformed JSON ignored
  }
});

const cleanup = () => {
  if (session) {
    session.close();
    session = null;
  }
};

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
