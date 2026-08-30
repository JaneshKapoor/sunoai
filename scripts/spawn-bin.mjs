/**
 * Spawn a dependency's CLI as a child process.
 *
 * Runs the package's JS entry point under the current Node binary rather than
 * the shim in node_modules/.bin. Going through the shim means a `.cmd` file on
 * Windows, which forces `shell: true` on spawn — that concatenates arguments
 * unescaped (Node DEP0190) and pulls in a shell we have no use for. Resolving
 * the entry point ourselves keeps the launchers shell-free on every platform.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { REPO_ROOT } from '../agent/env.mjs';

const require = createRequire(import.meta.url);

/**
 * @param {string} packageName  e.g. '@playwright/mcp'
 * @param {string} binName      key in the package's `bin` map
 * @param {string[]} args
 */
export function spawnPackageBin(packageName, binName, args) {
  const manifestPath = require.resolve(`${packageName}/package.json`, { paths: [REPO_ROOT] });
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName];
  if (!bin) {
    throw new Error(`${packageName} declares no bin named "${binName}".`);
  }
  const entry = resolve(dirname(manifestPath), bin);

  const child = spawn(process.execPath, [entry, ...args], { stdio: 'inherit' });

  const forward = (signal) => () => child.kill(signal);
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));

  child.on('exit', (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
  });

  return child;
}
