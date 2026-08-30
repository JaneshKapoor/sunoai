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

/**
 * Origins the browser is not allowed to request.
 *
 * Two problems, one fix.
 *
 * Google One Tap (accounts.google.com) opens a sign-in prompt over job sites.
 * It is a modal, so it captures the accessibility tree — the agent's snapshot
 * comes back as a single `- alert` node and the actual page is invisible to it.
 *
 * The ad and analytics origins are about cost. A naukri results page snapshots
 * at ~93KB with ads in it, and the whole thing goes into the model's context on
 * every look. On a tier that allows 20 requests a day, page weight is budget.
 *
 * Nothing here is about evading detection: these are ad, analytics, and
 * third-party sign-in origins, not the target site.
 */
const BLOCKED_ORIGINS = [
  'accounts.google.com',
  'securepubads.g.doubleclick.net',
  'googleads.g.doubleclick.net',
  'pagead2.googlesyndication.com',
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'static.doubleclick.net',
];

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
  '--blocked-origins', BLOCKED_ORIGINS.join(';'),
  // Ad and tracking scripts are the main users of service workers on these
  // sites, and they keep working in the background between turns.
  '--block-service-workers',
  // Headed. Watching the browser work is the point of the demo, and LinkedIn
  // treats headless far more harshly.
];

console.log(`browser-control MCP → http://localhost:${port}/mcp`);
console.log(`chrome profile      → ${userDataDir}`);

spawnPackageBin('@playwright/mcp', 'playwright-mcp', args);
