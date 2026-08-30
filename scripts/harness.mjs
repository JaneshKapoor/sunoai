/**
 * Launch the TrueForge harness on the port from .env.
 *
 * A script rather than an npm shell one-liner because `${TRUEFORGE_PORT:-8790}`
 * does not expand under npm's default shell on Windows, and this project has
 * to run there.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadEnv, REPO_ROOT } from '../agent/env.mjs';

loadEnv();
const port = process.env.TRUEFORGE_PORT || '8790';

// Call the locally installed binary directly so the pinned version in
// package.json is what runs, rather than whatever npx resolves from the network.
const binary = join(
  REPO_ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'trueforge.cmd' : 'trueforge',
);

const child = spawn(binary, ['--port', port], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
