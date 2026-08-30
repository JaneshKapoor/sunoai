# SunoAI

**Team Spambots** · TrueForge Agent Harness Hackathon

A browser agent you talk to in Hinglish — that **stops and asks before it ever
writes anything**.

Say *"analytics jobs dikhao"* and it opens Chrome, goes to the job listings, and
reads the top results back to you. Say *"doosre wale pe apply karo"* and it
drafts the action, reads it back, and **waits**. Nothing is submitted until you
say yes.

TrueForge is the agent. It owns the tool-calling loop, the model, the MCP
connection, and the approval gate. Everything else in this repo is thin.

---

## Build status — read this first

An honest account of what runs today, because a judge is going to clone it and
find out anyway.

| | Milestone | Status |
|---|---|---|
| 1 | TrueForge harness + Gemini 3 Flash responding | ✅ works |
| 1b | Browser-control MCP navigating and extracting text | ✅ works |
| 2 | Read the top listings back, typed input | ⚠️ runs end-to-end; on naukri a cookie-consent modal hides the page |
| 3 | Draft → approval gate → submit | 🟡 policy configured and enforced by the harness; runtime flow not scripted |
| 4 | Voice: STT in, TTS out | ❌ not built |
| 5 | "Jarvis" UI | ❌ not built |

**The voice layer is not built.** The name says voice and the architecture is
designed around it, but the audio client is not written. What exists is the
agent and the safety model underneath it, driven by typed text.

Two things ate the schedule, both documented below and both real: TrueForge does
not start on Windows at all without a patch, and the free Gemini tier allows
**20 requests per day per model** — roughly six agent turns.

---

## What it does and how it uses TrueForge

The flow is: **read a list → pick one → act on it → stop for approval → submit.**

TrueForge does the parts that matter:

- **The agent loop.** Every model call and tool call is TrueForge's. This repo
  never calls Gemini directly and never drives Playwright directly.
- **The model.** `gemini-3-flash-preview`, registered as a provider through
  TrueForge's settings API by [`agent/bootstrap.mjs`](agent/bootstrap.mjs).
- **The tools.** A real Playwright MCP server, registered as a connector.
  TrueForge's connector manifest has only a `remote` variant — there is no stdio
  transport — so the MCP server runs as its own HTTP process and the harness
  dials it.
- **The approval gate.** `require_approval_for_tools` in the agent manifest. The
  harness emits `tool.approval_required` and will not proceed until the client
  resumes the turn with a `user.tool_approval` decision.

The gate is the point of the project, so it is worth being precise about it.

### The safety model

**Denied outright**, not gated:

| Tool | Why |
|---|---|
| `browser_evaluate` | Runs arbitrary JS in the page |
| `browser_run_code_unsafe` | Same |
| `browser_file_upload` | Nothing in scope uploads a file |
| `browser_drop` | Same |

The first two are the interesting ones. They are a hole straight through the
approval gate: the model could submit a form with a scripted click and the
harness would only see a read-shaped tool call. **A gate only means something if
every route to a write passes through a tool it covers.**

**Gated on approval:** `browser_click`, `browser_type`, `browser_fill_form`,
`browser_press_key`, `browser_select_option` — everything left that can change a
page. Listed by name rather than via TrueForge's `@write` preset, because the
preset's meaning comes from tool metadata we do not control.

**Ungated:** navigate, snapshot, find, screenshot. Gating reads would train the
user to approve on reflex, which is how approval gates stop working.

It all lives in one file, [`agent/definition.mjs`](agent/definition.mjs), so the
policy cannot drift between the scripted checks, the voice client, and the UI.

There is no bypass flag, and the retry logic **refuses to retry any turn whose
transcript contains a gated tool** — re-running a turn that already submitted
something could submit it twice.

---

## Setup

Requires **Node.js 22.14+** and a Google AI Studio key
(https://aistudio.google.com/apikey).

```bash
git clone https://github.com/JaneshKapoor/sunoai && cd sunoai
npm install                  # also applies the Windows boot patch, below
cp .env.example .env         # then fill in GEMINI_API_KEY
```

Three terminals:

```bash
npm run harness              # TrueForge      -> http://localhost:8790
npm run browser              # Playwright MCP -> http://localhost:8931/mcp
npm run bootstrap            # register model + connector with the harness
```

Then:

```bash
npm run smoke:model          # harness -> Gemini
npm run smoke:browser        # harness -> MCP -> Chrome
npm run login                # check the browser profile is signed in
npm run read -- 3            # read the top 3 listings back
```

`npm run bootstrap` prints what it registered:

```
✓ models ready:         google-gemini/gemini-3-flash-preview, google-gemini/gemini-3-6-flash, ...
✓ browser MCP ready:    http://localhost:8931/mcp (24 tools)
```

`npm run smoke:browser` asserts a browser tool was **actually called**, not just
that the answer looked right:

```
tools called: browser_navigate, browser_snapshot
reply: The heading is Example Domain. The first sentence is, This domain is for
       use in documentation examples without needing permission.

✓ Milestone 1b: agent navigated and extracted text via the browser MCP.
```

TrueForge's own chat UI is at http://localhost:8790.

### One-time browser setup

The browser runs a real, on-disk Chrome profile (`.browser-profile/`,
gitignored) so a demo does not open with a login and a 2FA code on camera. Two
things you do by hand, once:

1. **Log in** to the target site in that Chrome window. `npm run login` parks it
   on the sign-in page and tells you.
2. **Dismiss the cookie-consent banner.** It is an `aria-modal`, so Chrome hides
   the entire page behind it and the agent's snapshot comes back as a single
   `alert` node.

Neither is automated, on purpose. Both are clicks, clicking is approval-gated,
and weakening the gate for setup convenience would undermine the one thing this
project is about.

---

## Configuration

Every key lives in `.env`, which is gitignored. Nothing is hardcoded. See
[`.env.example`](.env.example).

| Variable | What it's for |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL_ID` | Defaults to `gemini-3-flash-preview` |
| `GEMINI_FALLBACK_MODEL_IDS` | Comma-separated. Read the quota section. |
| `TRUEFORGE_PORT` / `TRUEFORGE_BASE_URL` | Where the harness listens |
| `BROWSER_MCP_PORT` / `BROWSER_MCP_URL` | Where the MCP server listens |
| `BROWSER_PROFILE_DIR` | On-disk Chrome profile |
| `TARGET_SITE` | `naukri` or `linkedin` |
| `NAUKRI_QUERY` | Search keyword, fixed so a demo is reproducible |

---

## Two things that will bite you

### TrueForge 0.1.4 does not start on Windows

It runs its migrations through kysely's `FileMigrationProvider`, which hands
`import()` a bare `C:\...` path. Node's ESM loader rejects it and the server
dies before it ever listens:

```
Failed to start server: Only URLs with a scheme in: file, data, and node are
supported by the default ESM loader. On Windows, absolute paths must be valid
file:// URLs. Received protocol 'c:'
```

kysely exposes an `import` prop as an escape hatch; TrueForge does not pass one.
[`scripts/patch-kysely-windows.mjs`](scripts/patch-kysely-windows.mjs) routes
the path through `pathToFileURL()` on `postinstall`. No-op on macOS and Linux,
idempotent, and it fails loudly if kysely changes upstream rather than silently
doing nothing.

### The free Gemini tier allows 20 requests per day, per model

```
GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20
```

Per **day**, not per minute — read off the quota violation metadata. One agent
turn spends three to five requests, so one model is about six turns a day. Two
models were exhausted in a single afternoon of ordinary development.

Getting a turn from about nine requests down to **three** took real work:

- **A read-only agent mode.** `buildAgentSpec({ mode: 'read' })` cuts the tool
  list to `browser_navigate` + `browser_snapshot` and the iteration limit to 6.
  An agent that *can* re-snapshot will spend a day's quota deciding it has not
  seen enough of the page — this one was looping `snapshot → find → snapshot`.
- **Blocked ad and sign-in origins.** A naukri results page snapshots at **93KB**
  with ads in it, and all of that enters context on every look. Google One Tap
  also opens a modal that captures the accessibility tree. On this tier, page
  weight is budget. Ad, analytics and third-party sign-in origins only — nothing
  touching the target site, and nothing about evading detection.
- **Prompts that say stop.** One snapshot, answer from it; a partial read beats
  looking again.

The quota is per model, so `GEMINI_FALLBACK_MODEL_IDS` registers several and
multiplies the budget. That is a workaround. The fix is billing.

Every run prints its cost:

```
tools called:   browser_navigate, browser_snapshot
model requests: 3  (free tier allows 20/day/model)
```

---

## Qodo Code Review Evidence

Qodo reviews every pull request through
[`.github/workflows/pr-agent.yml`](.github/workflows/pr-agent.yml), running
`qodo-ai/pr-agent` on Gemini. It deliberately reviews on a different model from
the one the agent runs on — the free tier allows 20 requests per day per model,
and a code review should not eat the demo's budget.

**Pull request history**

| PR | What | State |
|---|---|---|
| [#1](https://github.com/JaneshKapoor/sunoai/pull/1) | TrueForge harness bootstrap, Gemini provider, Windows boot patch | merged |
| [#2](https://github.com/JaneshKapoor/sunoai/pull/2) | Playwright browser-control MCP, tool policy | merged |
| [#3](https://github.com/JaneshKapoor/sunoai/pull/3) | Login helper, feed reading | merged |
| [#4](https://github.com/JaneshKapoor/sunoai/pull/4) | Site abstraction, naukri target, quota work, CI | reviewed by Qodo |

Qodo was wired up at PR #4, after #1–#3 had merged. Those three carry a written
review trail in their descriptions but no Qodo pass, and it would be dishonest
to imply otherwise.

### What Qodo found, and what changed

**1. The safety check failed open.** ([Qodo’s review](https://github.com/JaneshKapoor/sunoai/pull/4#issuecomment-5470234362))

This is the good one, and it landed on the exact line the whole project rests on.

`runTurnWithRetry` refuses to retry a turn that already called an
approval-gated tool, because re-running it could submit the same thing twice.
It decided that by reading the turn's transcript — and swallowed request
failures with `.catch(() => [])`. An empty event list reads as *"no gated tools
were called"*.

So a network blip while checking whether a turn had already submitted something
would let the retry go ahead. The guard against double submission could be
removed by the kind of transient error it was written to survive.

> **Qodo:** *"If a transient network or API error occurs during this check,
> `runTurnWithRetry` will proceed to retry the turn even if it previously
> executed an approval-gated (write) tool, potentially leading to unintended
> double-submissions."*

Fixed: it now fails closed. If the transcript cannot be read, it reports that
the turn *may* have written something and declines to retry. Being wrong in that
direction costs one un-retried turn; being wrong in the other costs a real,
unretractable write.

**2. An unbounded retry wait could hang the process.** Applied. A hint longer
than 90 seconds is the daily quota resetting hours away, not a load spike.
Rather than cap the sleep and fail anyway, it now reports the quota error
immediately — sleeping through a quota reset would hang the script and, once
there is a voice client, leave a caller listening to silence.

**3. A missing turn id was not guarded.** Applied. No id means the turn never
started, so there is nothing to inspect and nothing safe to assume.

**4. The naukri search keyword was not lowercased.** Applied. Its URL routing
expects lowercase hyphenated paths, and a mixed-case query redirects or 404s.

All four were accepted. Qodo also reported no security concerns and flagged the
absence of tests, which is a fair hit — the milestone scripts assert against a
live agent, and there is no unit suite.

### Caught during self-review, before any tool flagged them

- A smoke test printed ✓ while reporting `tools called: (none)`. The answer was
  correct and the event parsing was wrong — without the assertion the check
  would have passed while proving nothing.
- The read script printed ✓ when the agent had said, in prose, that it could not
  see any listings. Sites now emit a `NO_RESULTS:` marker the script fails on.
- Launchers spawned through `node_modules/.bin`, which is a `.cmd` on Windows
  and forces `shell: true` — unescaped argument concatenation, Node `DEP0190`.
  Replaced with direct entry-point resolution.
- `.playwright-mcp/` was staged. It holds page snapshots; pointed at a real feed
  those contain real content. Now gitignored.

---

## Project layout

```
agent/
  env.mjs           .env loader and config resolver
  api.mjs           TrueForge HTTP API client, retry, event parsing
  definition.mjs    agent instructions + tool policy (single source of truth)
  bootstrap.mjs     idempotent harness setup
  sites/            per-site URLs and prompts (naukri, linkedin)
  scripts/          milestone checks
scripts/            launchers and the Windows patch
```

## Scope

One path: read a list, act on one item, stop for approval, submit. Deliberately
not a general "control any app" agent.

## License

MIT
