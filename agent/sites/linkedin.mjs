/**
 * LinkedIn: the feed.
 *
 * One of the site modules under agent/sites/. Each describes a target site --
 * where its list of things lives, how to tell whether we are signed in, and how
 * to ask for the list read back. agent/definition.mjs stays about what the
 * agent may do; these are about where it does it.
 */

export const NAME = 'linkedin';
export const DISPLAY_NAME = 'LinkedIn';

/** What the list items are called, for prompts and script output. */
export const ITEM_NOUN = 'post';

export const LIST_URL = 'https://www.linkedin.com/feed/';

// Kept for readability in this file; LIST_URL is the interface.
const FEED_URL = LIST_URL;

/**
 * Ask the agent whether the browser profile is signed in.
 *
 * The reply is constrained to two tokens so a script can branch on it. Asking
 * the agent rather than checking for a cookie means we read the page the same
 * way the rest of the flow does — if LinkedIn shows a checkpoint or a
 * suspicious-activity interstitial instead of the feed, that shows up here
 * rather than being silently treated as "logged in".
 */
export const loginCheckPrompt = () => `
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
export function readListPrompt(count) {
  return `
Navigate to ${FEED_URL} and take a snapshot of the feed.

Read the top ${count} posts. For each one, give me a single short line:
the author's name, then what the post is about in one sentence of your own.

Number them out loud — "Pehla post", "Doosra post" — so I can refer back to one.
Skip promoted and suggested posts; I only want real posts from the feed.
Do not click anything.

If you cannot read the list at all — the page is blank, a dialog is covering it,
or nothing that looks like a result is there — reply with a single line starting
exactly "NO_RESULTS:" followed by what you actually saw. Do not invent entries,
and do not look again.
`.trim();
}
