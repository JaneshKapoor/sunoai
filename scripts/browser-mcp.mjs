/**
 * Launch the Playwright browser-control MCP server over HTTP.
 *
 * TrueForge only connects to *remote* MCP servers (its connector manifest has
 * no stdio variant), so this runs as its own process and the harness talks to
 * it at BROWSER_MCP_URL. This is the only thing that touches a browser — the
 * agent drives it purely through MCP tool calls.
 */
import { join } from 'node:path';
import { loadEnv, REPO_ROOT } from '../agent/env.mjs';
import { spawnPackageBin } from './spawn-bin.mjs';

loadEnv();
const port = process.env.BROWSER_MCP_PORT || '8931';

// A real, on-disk Chrome profile. Without it every run starts logged out of
// LinkedIn, which makes the demo unreproducible — you would have to log in
// (and clear 2FA) on camera every time. Gitignored.
const userDataDir = process.env.BROWSER_PROFILE_DIR || join(REPO_ROOT, '.browser-profile');

const args = [
  '--port', port,
  // Chrome specifically, not bundled Chromium: the demo says "opens Chrome",
  // and LinkedIn is measurably less suspicious of a stock Chrome UA.
  '--browser', 'chrome',
  '--user-data-dir', userDataDir,
  // One browser context across HTTP clients, so the agent's navigation and a
  // follow-up turn land on the same tab instead of a fresh blank one.
  '--shared-browser-context',
  '--viewport-size', '1280x800',
  // Headed. Watching the browser work is the point of the demo, and LinkedIn
  // treats headless far more harshly.
];

console.log(`browser-control MCP → http://localhost:${port}/mcp`);
console.log(`chrome profile      → ${userDataDir}`);

spawnPackageBin('@playwright/mcp', 'playwright-mcp', args);
