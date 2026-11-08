#!/usr/bin/env node
// Adds the Ducks on the Pond MCP server to Claude Desktop's config, keeping every server already there.
// Run it on your Mac:  node "/Users/landersen/Claude/Code/Working Folder/Week 8/mcp-server/add-to-claude-config.mjs"
// It saves a backup of the old config next to it first.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const configPath = join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
const serverPath = join(dirname(fileURLToPath(import.meta.url)), "ducks-mcp.mjs");

let config = {};
if (existsSync(configPath)) {
  const raw = readFileSync(configPath, "utf8");
  if (raw.trim()) {
    try {
      config = JSON.parse(raw);
    } catch (err) {
      console.error(`Your config file has a JSON error, so nothing was changed:\n  ${configPath}\n  ${err.message}`);
      process.exit(1);
    }
  }
  const backup = `${configPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(configPath, backup);
  console.log(`Backup saved: ${backup}`);
} else {
  mkdirSync(dirname(configPath), { recursive: true });
}

config.mcpServers ??= {};
config.mcpServers["ducks-on-the-pond"] = {
  // Full path to this node, because Claude Desktop doesn't see your Terminal's PATH.
  command: process.execPath,
  args: [serverPath],
  env: { DUCKS_BASE_URL: "https://ducks-on-the-pond-psi.vercel.app" },
};

writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Added "ducks-on-the-pond" to ${configPath}`);
console.log(`Servers now configured: ${Object.keys(config.mcpServers).join(", ")}`);
console.log("Now quit Claude completely (Cmd+Q) and reopen it.");
