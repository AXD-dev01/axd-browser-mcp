#!/usr/bin/env node
/**
 * @axd/browser-mcp — Model Context Protocol (MCP) Standard Server
 * Compatible with Claude Desktop, Cursor, Windsurf, OpenCode, and any MCP Client.
 */

const readline = require("readline");
const { BrowserSession } = require("./cdp");

let session = null;

async function getSession() {
  if (!session) {
    session = new BrowserSession({ headless: true });
    await session.init();
  }
  return session;
}

const TOOLS = [
  {
    name: "browser_navigate",
    description: "Navigate to a URL using sovereign stealth CDP (bypasses Cloudflare / bot checks)",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL to navigate to" }
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
        selector: { type: "string", description: "CSS selector of element to click" }
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
        text: { type: "string", description: "Text string to type" }
      },
      required: ["selector", "text"]
    }
  },
  {
    name: "browser_extract",
    description: "Extract clean page title, URL, and full text content in sub-milliseconds without taking expensive screenshots",
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
  }
];

async function handleCall(name, args) {
  const s = await getSession();
  switch (name) {
    case "browser_navigate":
      return await s.navigate(args.url);
    case "browser_click":
      return await s.click(args.selector);
    case "browser_type":
      return await s.type(args.selector, args.text);
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
          serverInfo: { name: "@axd/browser-mcp", version: "1.0.0" }
        }
      };
      console.log(JSON.stringify(resp));
    } else {
      console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }));
    }
  } catch (e) {
    // Malformed JSON input ignored
  }
});

process.on("exit", () => {
  if (session) session.close();
});
