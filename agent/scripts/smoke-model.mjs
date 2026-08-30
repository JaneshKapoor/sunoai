/**
 * Milestone 1 check: is the harness wired to Gemini and answering?
 *
 * Deliberately sends a code-switched Hinglish prompt rather than an English
 * one — Hinglish is the project's core input mode, so the very first check
 * should exercise it.
 *
 *   npm run smoke:model
 */
import { config } from '../env.mjs';
import { TrueForgeClient } from '../api.mjs';

const PROMPT = 'Namaste! Ek line mein Hinglish mein batao: tum kya kar sakte ho?';

const cfg = config();
const client = new TrueForgeClient(cfg.trueforgeBaseUrl);
await client.waitUntilReady();

const modelFqn = `google-gemini/${cfg.geminiModelId.replace(/[^a-z0-9]+/g, '-')}`;
const sessionId = await client.createSession({
  model: { name: modelFqn },
  instructions:
    'You are SunoAI, a voice assistant. Users speak Hindi, English, or Hinglish ' +
    '(code-switched). Understand all three and reply in whichever the user used. ' +
    'Keep answers short — they get read aloud.',
  config: { sandbox: { enabled: false }, dynamic_sub_agents: { enabled: false } },
});

console.log(`model:   ${modelFqn}`);
console.log(`session: ${sessionId}`);
console.log(`prompt:  ${PROMPT}\n`);

const turn = await client.runTurn(sessionId, [{ type: 'user.message', content: PROMPT }]);

if (turn.state.status !== 'done') {
  console.error(`✗ turn ended as "${turn.state.status}":`, JSON.stringify(turn.state, null, 2));
  process.exit(1);
}

console.log(`reply:   ${turn.state.output?.content}`);
console.log(`\n✓ Milestone 1: harness + ${cfg.geminiModelId} responding.`);
