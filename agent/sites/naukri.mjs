/**
 * Naukri: job search results.
 *
 * One of the site modules under agent/sites/. Each describes a target site —
 * where its list of things lives, how to tell whether we are signed in, and how
 * to ask for the list read back.
 */

export const NAME = 'naukri';
export const DISPLAY_NAME = 'Naukri';

/** What the list items are called, for prompts and script output. */
export const ITEM_NOUN = 'job';

/**
 * Naukri builds search URLs as /<keyword>-jobs, so the query is part of the
 * path rather than a parameter. Fixed by default: a demo has to land on the
 * same search every time, not whatever the site decides to show.
 */
export const SEARCH_QUERY = process.env.NAUKRI_QUERY || 'analytics';

export const LIST_URL = `https://www.naukri.com/${SEARCH_QUERY.trim().replace(/\s+/g, '-')}-jobs`;

/**
 * Ask the agent whether the browser profile is signed in.
 *
 * Naukri shows job listings to signed-out visitors, so unlike LinkedIn a
 * LOGGED_OUT result does not block reading. It does block applying, which is
 * why the answer still matters — and why the read scripts report it rather
 * than ignoring it.
 */
export const loginCheckPrompt = () => `
Navigate to ${LIST_URL} and take a snapshot.

Then reply with exactly one line and nothing else:
- "LOGGED_IN" if you can see a signed-in account — a profile menu, an avatar,
  or the user's name in the header.
- "LOGGED_OUT" if you see Login or Register buttons in the header.
- "CHALLENGE: <short description>" if something blocks the page entirely —
  a CAPTCHA, a bot check, or an access-denied message.

Do not click anything. Do not try to sign in or solve a challenge.
`.trim();

/**
 * Ask the agent to read the top N job results back.
 *
 * The shape is fixed on purpose: the answer gets spoken, and a numbered list of
 * short lines is what lets the user say "the second one" afterwards. Salary and
 * location are included because they are what someone actually chooses on, and
 * they are short enough to say out loud.
 */
export function readListPrompt(count) {
  return `
Navigate to ${LIST_URL}. Take ONE snapshot. Then answer from that snapshot.

Read the top ${count} jobs. For each one, give me a single short line:
the job title, the company, the experience required, and the location.
If the salary is shown, add it; if it says "Not disclosed", skip it rather
than saying so.

Number them out loud — "Pehla job", "Doosra job" — so I can refer back to one.
Skip any advertisement or sponsored block; I only want real job results.

The results page is long and the snapshot will be large. That is expected.
Read the ${count} jobs nearest the top of it and stop. Do not take another
snapshot, do not scroll, and do not click anything. If you can only make out
fewer than ${count} jobs, tell me the ones you could read and say so — that is
a better answer than looking again.

If you cannot read the list at all — the page is blank, a dialog is covering it,
or nothing that looks like a result is there — reply with a single line starting
exactly "NO_RESULTS:" followed by what you actually saw. Do not invent entries,
and do not look again.
`.trim();
}
