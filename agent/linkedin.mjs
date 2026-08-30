/**
 * LinkedIn specifics: URLs, and how the agent is asked about the feed.
 *
 * Kept apart from agent/definition.mjs, which is about what the agent may do.
 * This is about the one site it does it on.
 */

export const FEED_URL = 'https://www.linkedin.com/feed/';

/**
 * Ask the agent whether the browser profile is signed in.
 *
 * The reply is constrained to two tokens so a script can branch on it. Asking
 * the agent rather than checking for a cookie means we read the page the same
 * way the rest of the flow does — if LinkedIn shows a checkpoint or a
 * suspicious-activity interstitial instead of the feed, that shows up here
 * rather than being silently treated as "logged in".
 */
export const LOGIN_CHECK_PROMPT = `
Navigate to ${FEED_URL} and take a snapshot.

Then reply with exactly one line and nothing else:
- "LOGGED_IN" if the post feed is visible.
- "LOGGED_OUT" if you see a sign-in or join page.
- "CHALLENGE: <short description>" if you see anything else blocking the feed —
  a CAPTCHA, a security checkpoint, a "confirm it's you" prompt, or a
  suspicious-activity warning.

Do not click anything. Do not try to sign in or solve a challenge.
`.trim();

/**
 * Ask the agent to read the top N posts back.
 *
 * The shape is fixed on purpose: the answer gets spoken, and a numbered list
 * of short summaries is what lets the user say "comment on the second one".
 */
export function readFeedPrompt(count) {
  return `
Navigate to ${FEED_URL} and take a snapshot of the feed.

Read the top ${count} posts. For each one, give me a single short line:
the author's name, then what the post is about in one sentence of your own.

Number them out loud — "Pehla post", "Doosra post" — so I can refer back to one.
Skip promoted and suggested posts; I only want real posts from the feed.
Do not click anything.
`.trim();
}
