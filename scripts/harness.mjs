/**
 * Launch the TrueForge harness on the port from .env.
 *
 * A script rather than an npm shell one-liner because `${TRUEFORGE_PORT:-8790}`
 * does not expand under npm's default shell on Windows, and this project has
 * to run there.
 */
import { loadEnv } from '../agent/env.mjs';
import { spawnPackageBin } from './spawn-bin.mjs';

loadEnv();
const port = process.env.TRUEFORGE_PORT || '8790';

console.log(`TrueForge harness → http://localhost:${port}`);

spawnPackageBin('@truefoundry/trueforge', 'trueforge', ['--port', port]);
