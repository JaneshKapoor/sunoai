/**
 * Milestone 2: "read the top items back", driven by typed text.
 *
 *   npm run read                    # top 3 from TARGET_SITE
 *   npm run read -- 5               # top 5
 *   TARGET_SITE=linkedin npm run read
 *
 * Typed input stands in for voice on purpose — this proves harness + MCP +
 * model before any audio is in the picture. The text printed here is exactly
 * what the voice client will hand to TTS.
 */
import { config } from '../env.mjs';
import { TrueForgeClient, toolCallsIn, modelRequestsIn } from '../api.mjs';
import { buildAgentSpec, modelFqnFor, APPROVAL_REQUIRED_TOOLS } from '../definition.mjs';
import { resolveSite, NO_RESULTS_PREFIX } from '../sites/index.mjs';

const DEFAULT_COUNT = 3;
const MAX_COUNT = 10;

const raw = process.argv[2] ?? String(DEFAULT_COUNT);
const count = Number(raw);
if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
  console.error(`Count must be a whole number from 1 to ${MAX_COUNT} (got "${raw}").`);
  process.exit(1);
}

const site = resolveSite();
const cfg = config();
const client = new TrueForgeClient(cfg.trueforgeBaseUrl);
await client.waitUntilReady();

// 'read' mode: navigate and snapshot only. On the free tier an agent that can
// re-snapshot will spend the day's quota looking at the same page again.
const sessionId = await client.createSession(
  buildAgentSpec({ modelFqn: modelFqnFor(cfg.geminiModelId), mode: 'read' }),
);

console.log(`site:    ${site.DISPLAY_NAME} (${site.LIST_URL})`);
console.log(`session: ${sessionId}`);
console.log(`reading top ${count} ${site.ITEM_NOUN}s ...\n`);

const turn = await client.runTurnWithRetry(sessionId, [
  { type: 'user.message', content: site.readListPrompt(count) },
]);

if (turn.state.status !== 'done') {
  console.error(`✗ turn ended as "${turn.state.status}": ${turn.state.message ?? ''}`);
  process.exit(1);
}

const events = await client.get(
  `/api/v1/sessions/${sessionId}/turns/${encodeURIComponent(turn.id)}/events`,
);
const toolNames = toolCallsIn(events).map((call) => call.name);

const reply = (turn.state.output?.content ?? '').trim();

console.log('─'.repeat(70));
console.log(reply || '(no reply)');
console.log('─'.repeat(70));
console.log(`\ntools called:   ${toolNames.join(', ') || '(none)'}`);
console.log(`model requests: ${modelRequestsIn(events)}  (free tier allows 20/day/model)`);

// Reading must not touch anything. If a gated tool shows up here, the agent
// reached for a write during a pure read — worth failing over even though the
// gate would have caught it.
const gated = toolNames.filter((name) => APPROVAL_REQUIRED_TOOLS.includes(name));
if (gated.length > 0) {
  console.error(`\n✗ A read-only request reached write tools: ${gated.join(', ')}`);
  process.exit(1);
}
if (toolNames.length === 0) {
  console.error('\n✗ The agent answered without touching the browser.');
  process.exit(1);
}
if (reply.startsWith(NO_RESULTS_PREFIX)) {
  console.error(`\n✗ The agent reached the page but could not read any ${site.ITEM_NOUN}s.`);
  console.error('  Its own account of what it saw is above. Reporting that beats');
  console.error('  printing a tick over an empty answer.');
  process.exit(1);
}

console.log(`\n✓ Milestone 2: top ${site.ITEM_NOUN}s read back, no write tools touched.`);
console.log(`\nSession ${sessionId} is still open — a follow-up ("the second one")`);
console.log(`continues in it, which is how the agent knows which ${site.ITEM_NOUN} you mean.`);
