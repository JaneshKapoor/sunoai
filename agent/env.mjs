/**
 * Minimal .env loader + config resolver shared by the agent-side scripts.
 *
 * Deliberately dependency-free: the bootstrap has to be runnable straight after
 * `npm install` without pulling dotenv in just for a dozen lines.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Parse a .env file into a plain object. Ignores blanks and `#` comments. */
function parseEnvFile(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes, if present.
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load .env into process.env without clobbering variables already set in the
 * real environment — an explicit `GEMINI_API_KEY=... npm run x` should win.
 */
export function loadEnv(envPath = join(REPO_ROOT, '.env')) {
  if (!existsSync(envPath)) return;
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(envPath, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Read a required variable, failing loudly with a pointer to .env.example. */
export function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in (see README).`,
    );
  }
  return value;
}

export function config() {
  loadEnv();
  const port = process.env.TRUEFORGE_PORT || '8790';
  return {
    geminiApiKey: required('GEMINI_API_KEY'),
    geminiModelId: process.env.GEMINI_MODEL_ID || 'gemini-3-flash-preview',
    trueforgePort: port,
    trueforgeBaseUrl: process.env.TRUEFORGE_BASE_URL || `http://localhost:${port}`,
    browserMcpPort: process.env.BROWSER_MCP_PORT || '8931',
    browserMcpUrl:
      process.env.BROWSER_MCP_URL ||
      `http://localhost:${process.env.BROWSER_MCP_PORT || '8931'}/mcp`,
  };
}
