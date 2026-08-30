/**
 * Check whether the browser profile is signed in to the target site, and if
 * not, park Chrome on its sign-in page so you can log in by hand.
 *
 *   npm run login
 *   TARGET_SITE=linkedin npm run login
 *
 * You log in once. The session lives in the on-disk Chrome profile
 * (BROWSER_PROFILE_DIR, default ./.browser-profile, gitignored) and survives
 * across runs, so a demo does not start with a login and a 2FA code on camera.
 *
 * Nothing here handles your credentials — the agent is explicitly told not to
 * click or type on this page, and typing is gated on approval anyway. You type
 * them into Chrome yourself.
 */
import { config } from '../env.mjs';
import { TrueForgeClient } from '../api.mjs';
import { buildAgentSpec, modelFqnFor } from '../definition.mjs';
import { resolveSite } from '../sites/index.mjs';

const site = resolveSite();
const cfg = config();
const client = new TrueForgeClient(cfg.trueforgeBaseUrl);
await client.waitUntilReady();

const sessionId = await client.createSession(
  buildAgentSpec({ modelFqn: modelFqnFor(cfg.geminiModelId), mode: 'read' }),
);

console.log(`Checking ${site.DISPLAY_NAME} sign-in state ...\n`);
const turn = await client.runTurnWithRetry(sessionId, [
  { type: 'user.message', content: site.loginCheckPrompt() },
]);

if (turn.state.status !== 'done') {
  console.error(`✗ turn ended as "${turn.state.status}": ${turn.state.message ?? ''}`);
  process.exit(1);
}

const answer = (turn.state.output?.content ?? '').trim();

if (answer.startsWith('LOGGED_IN')) {
  console.log(`✓ Signed in to ${site.DISPLAY_NAME}. The profile is ready — nothing to do.`);
  process.exit(0);
}

if (answer.startsWith('CHALLENGE')) {
  console.error(`\n✗ ${site.DISPLAY_NAME} is showing a challenge, not the page:\n\n    ${answer}\n`);
  console.error(
    'Stopping here on purpose. Working around a challenge means evading bot\n' +
      'detection, which this project does not do. Resolve it by hand in the\n' +
      'Chrome window, or come back to it later, then re-run `npm run login`.',
  );
  process.exit(2);
}

console.log(`Not signed in (agent said: ${answer || '(nothing)'}).\n`);
console.log(`Chrome is open on ${site.DISPLAY_NAME} with the profile this project uses.`);
console.log('Log in there by hand — including any 2FA — then re-run `npm run login`');
console.log('to confirm. You only have to do this once.');
process.exit(1);
