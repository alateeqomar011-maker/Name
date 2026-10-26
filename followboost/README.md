# FollowBoost AI

A dark, glass-style web app for planning follower growth. Pick a target (1,000, 5,000, 10,000 or 100,000 followers), a platform and a public username, then choose one of two modes:

- **Demo mode** runs a clearly labeled simulation of a bot-follower order: live progress, a simulated growth curve, sample made-up bot profiles, and an explanation of why bot followers hurt an account. Nothing is ever sent to a platform or added to an account.
- **Real growth** builds a plan to earn genuine followers: a realistic timeline, a projected growth curve with milestones, posting cadence and formats, content pillars for your niche, a weekly checklist you can tick off, and the numbers to watch. Copy it or download it as Markdown.

FollowBoost never asks for passwords or login codes. It only checks that a username is formatted correctly for the chosen platform, and it has no server: requests and history stay in the browser's local storage.

## Run it

```bash
cd followboost
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + static build in dist/
npm run preview    # serve the build
```

The build is a static site (relative asset paths, hash routing), so `dist/` can be hosted anywhere.

## Tests

```bash
npm test                          # unit tests (Vitest)
npm run build && npm run test:e2e # browser tests (Playwright + Chromium)
```

The end-to-end suite drives every flow at desktop, iPad and iPhone sizes: validation messages, demo and growth runs, failures, the queue, cancel, duplicate protection, history filters and exports, delete and clear, help and reset. It checks for console errors and horizontal scrolling, and saves screenshots to `e2e/screenshots/`. It needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`) if your machine doesn't already have it.

## What's inside

| Path | What it does |
| --- | --- |
| `src/lib/platforms.ts` | Eight platforms and their username rules; validation that accepts `@name` or profile links and rejects emails or anything that looks like a password |
| `src/lib/requests.ts` | Request model and the queue engine: time-based progress (it resumes after a reload), stages, cancel, and handle screening |
| `src/lib/simulation.ts` | Seeded demo report: curve, sample bot profiles, traits, engagement dilution |
| `src/lib/growthPlan.ts` | Growth plan: timelines by platform and target, projection, milestones, cadence, checklist |
| `src/state/` | Store (reducer + local storage), toasts, confirm dialogs, shared request actions |
| `src/views/` | Generate, progress dialog, dashboard, history, request detail with reports, safety and help |

## Request statuses

`Queued` → `Processing` → `Completed`, or `Failed` (a reserved or platform-owned handle such as `@admin` or `@instagram`) or `Cancelled`. Up to five requests can be queued or running at once, and an identical request can't be queued twice.
