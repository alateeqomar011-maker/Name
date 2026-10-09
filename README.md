# Starcall

Real-time AI video calls, voice calls and text chats with a library of 458 clearly labelled **AI simulations** of public figures, including footballers, fighters, creators, actors, musicians, scientists, historical figures and Arab and Gulf stars. You can also start group calls in which several characters take turns.

Every character is an AI simulation. Avatars are stylised animations rendered live in the browser, not photos and not deepfakes. Voices are synthetic stock voices unless an authorised licence is on file. Nothing a character says comes from the real person, and the app says so on every screen, in every call, and whenever someone asks.

---

## Quick start

```bash
npm install
cp .env.example .env      # optional – add keys for real AI conversations and neural voices
npm run dev               # API on :8787 + Vite on :5173 → open http://localhost:5173
```

Requirements: **Node 22.18+**, which runs the TypeScript server directly. No database server is needed because data is stored in SQLite under `DATA_DIR`.

Without any keys the app runs in a labelled **demo mode**. Replies are scripted placeholders and the browser's built-in speech is used. Add `ANTHROPIC_API_KEY` for real conversations.

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | API (auto-restarts on server changes) and Vite dev server       |
| `npm run build`     | Production client build into `dist/`                           |
| `npm start`         | Production server: API and the built client on `PORT`           |
| `npm test`          | Unit and HTTP integration tests (`node --test`, in-memory DB)  |
| `npm run typecheck` | `tsc --noEmit` over server, client, shared code and tests       |

## What is real, and what each provider adds

| Capability             | Without keys                                      | With keys                                                                                       |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Conversation           | Scripted demo replies (labelled "Demo")           | **Claude** (`ANTHROPIC_API_KEY`), streamed sentence by sentence                                   |
| Speech synthesis       | Browser voices (Web Speech API)                   | **OpenAI** `gpt-4o-mini-tts` or **ElevenLabs** stock voices, with spectrum-driven lip sync        |
| Speech recognition     | Browser recognition (Chrome, Edge, Safari)        | **OpenAI** or **Deepgram** transcription of mic audio (works in every browser)                    |
| Live captions          | Captions in the call language                     | Caption translation into any of 16 languages (Claude)                                           |
| Avatar video           | Procedural real-time 2.5D avatar (Canvas)         | **D-ID** streaming WebRTC avatar, *only* for characters with a licensed likeness on file          |
| Moderation             | Multilingual rule-based checks                    | Adds OpenAI `omni-moderation-latest`                                                             |
| Payments               | Premium page explains it is not configured        | **Stripe** Checkout, customer portal and signed webhooks                                          |

`/api/health` reports what is active, and the UI adapts. For example, it shows a demo banner and offers "server" speech options only when they exist.

## Features

- **Library and discovery**:
  - 458 characters in 14 categories, all with Arabic names;
  - search by name, alias ("cr7"), Arabic name ("رونالدو"), role, country, language, region (Arab world, Gulf) and popularity;
  - trending (popularity, recent calls and freshness), recently added, personalised recommendations, favourites and curated rails;
  - a profile page for every character.
- **Video and voice calls**:
  - **Avatar**: a live avatar with lip sync, blinks, saccades, eye contact, idle head motion, listening nods and emotion reactions per sentence, in 16 profession environments (stadium, octagon, majlis, lab…) or a custom background;
  - **Your side**: camera self-view, mute, camera, speaker and output device controls, captions with translation, and a transcript panel;
  - **Turn-taking**: barge-in, so you can talk over the character to interrupt; push-to-talk; tap-to-talk; typed messages.
- **Group calls** with up to 5 characters. A turn-taking director picks who answers, by name, "everyone", or least-recently-heard. Characters hand off to each other and speak strictly one at a time. There are 9 preset rooms.
- **Scenarios**: hangout, interview, quiz, masterclass, funny mode, roleplay, pep talk, language practice, and debate and press conference for groups.
- **Text chat**, **conversation history** with saved transcripts (downloadable as .txt or .json), and **AI video greetings**. Greeting scripts are AI-written and recorded in the browser to WebM/MP4 with a burned-in "AI-GENERATED · FICTIONAL" watermark.
- **Accounts and plans**: instant guest accounts, optional email sign-up that keeps your history, daily free limits, and Premium through Stripe.
- **Safety**: age gate, teen family mode, reporting, rights-holder removal requests, a do-not-simulate list, and moderation with crisis responses.
- **UI** in English, Arabic (full RTL), Spanish and Portuguese. Responsive from phones to desktops.
- **Admin console** (`/admin`): KPIs, add or edit characters with live avatar preview, bulk JSON import, enable or disable, and triage of reports, requests, rights requests and moderation flags.

## Configuration

Everything is optional. See [`.env.example`](.env.example) for the full list.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Real conversations, caption translation and greeting scripts with Claude (`LLM_MODEL` defaults to `claude-opus-5-5`) |
| `OPENAI_API_KEY` | Neural TTS (stock voices with per-character style instructions), STT and moderation |
| `ELEVENLABS_API_KEY` | ElevenLabs stock voice pools (`ELEVENLABS_VOICES_MALE`/`_FEMALE` to override). Never clones voices |
| `DEEPGRAM_API_KEY` | Server speech-to-text |
| `DID_API_KEY` | Streaming photoreal avatars for **licensed** likenesses only |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Premium subscriptions. Point the webhook at `/api/billing/webhook` |
| `SESSION_SECRET` | Signs session cookies. **Set it in production**, or everyone is signed out on restart |
| `ADMIN_TOKEN` | Enables `/admin` and `/api/admin/*` (Bearer token) |
| `FREE_*`, `PREMIUM_*` | Daily limits: call seconds, text messages, group calls, video greetings |
| `PORT`, `PUBLIC_URL`, `DATA_DIR` | Server port, public URL for redirects, SQLite location |

## Architecture

```
shared/          Types, categories, countries/languages, scenarios, text utils, group turn director
server/          Express 5 + node:sqlite, TypeScript run natively by Node
  catalog/       Seed library (seed/*.ts), search/ranking/recommendations, admin overrides, opt-out list
  ai/            Persona prompts, Claude streaming, offline mode, moderation, TTS/STT, translation, greetings
  routes/        chat (SSE), catalog, account, community, billing (Stripe), avatar (D-ID proxy), admin
src/             React 19 client
  avatar/        Procedural avatar renderer, environments, lip sync
  call/          Call engine: audio graph, mic/VAD, recognition, speech queue, barge-in, group turns
  pages/         Home, Browse, Character, Call, Chat, Group, History, Greeting, Premium, Settings, Admin…
tests/           node:test suites (text, director, safety, HTTP API)
dev/             Avatar lab (renders every character side by side) – open via Vite at /dev/avatar-lab.html
```

**How a call turn works**
1. Speech is captured, either by browser recognition or by mic audio sent through an AudioWorklet to `/api/stt`.
2. `/api/chat` streams Claude's reply over SSE.
3. The client splits the stream into sentences as they arrive. Each sentence is synthesised while the next one is still being generated, so the character starts talking after the first sentence rather than the whole reply.
4. Playback drives the avatar's mouth: audio-spectrum visemes for server voices, word boundaries for browser voices.
5. If you start talking, the engine ducks and then stops the character. Only the sentences that were actually spoken are kept in the transcript, and the model is told it was interrupted.
6. In group calls the director queues speakers, and each one gets the labelled group transcript plus "Now reply as X".

**Characters without a rebuild.** The seed library ships in code, but every character can be overridden, disabled or added at runtime. Changes are stored in SQLite and go live immediately with no rebuild or restart.

## Adding characters

Use the admin console (`/admin` → *new* / *import*) or the API:

```bash
curl -X POST localhost:8787/api/admin/characters \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{
    "name": "New Star", "nameAr": "نجم جديد", "category": "football", "country": "SA", "gender": "m",
    "role": "Winger", "knownFor": "One-line, well-established public description",
    "traits": ["energetic", "humble", "funny"], "popularity": 70, "aliases": ["Nickname"],
    "colors": ["#006c35", "#ffffff"], "tags": ["rising"],
    "look": { "hair": "fade", "facial": "stubble", "accessory": "none", "outfit": "jersey" }
  }'
```

- **Required**: `name`, `category`, `country` (ISO code), `gender` (`m`/`f`), `knownFor`. Everything else gets defaults from the category, country and gender, including voice, accent, environment, languages and palette.
- **Bulk import**: `POST /api/admin/import` with an array, or `{ "characters": [...] }`, of up to 5,000 characters. Each one is validated separately, and errors are reported per index.
- **Other endpoints**: `PUT /api/admin/characters/:id` edits a character, `POST …/:id/enabled` disables or enables it, and `DELETE …/:id` removes an admin-created character or reverts a seed character.
- **Categories**: `football, mma, boxing, wrestling, basketball, athletes, creators, gaming, actors, music, comedy, history, science, business`.
- **Look options**:
  - `hair`: short, buzz, bald, curly, afro, long, ponytail, bun, mohawk, wavy, locs, slick, spiky, bob, braids, fade;
  - `facial`: none, stubble, beard, goatee, mustache, full;
  - `accessory`: none, headband, headphones, cap, glasses, ghutra, hijab, beanie, laurel, turban;
  - `outfit`: jersey, tee, hoodie, suit, jacket, robe, thobe, labcoat, tracksuit, tank.

### Licensed voices and likenesses

A character can use a voice replica or a photoreal avatar **only** with a licence reference on file:

```json
"voice":    { "authorized": true, "elevenVoiceId": "…", "licenseRef": "CONTRACT-2026-014" },
"likeness": { "status": "licensed", "provider": "did", "sourceRef": "https://…/approved-portrait.jpg", "licenseRef": "CONTRACT-2026-014" }
```

Without `licenseRef` (and `sourceRef` for likenesses), the server silently falls back to a stock synthetic voice and the stylised avatar. Licensed characters show "Licensed voice" or "Licensed likeness" on their profile. The public API never exposes voice IDs or licence references.

## Safety and honesty design

- **Disclosure everywhere**:
  - an "AI simulation" badge on every card, profile, call tile and chat;
  - an "AI SIMULATION" watermark drawn into the avatar canvas itself, so it is present in screen captures too;
  - a footer disclosure on every page and an `/about-ai` explainer.
- **Persona prompt rules that outrank the persona**:
  - always admit to being an AI simulation when asked;
  - never claim the voice is the real person's;
  - no private or invented personal facts, endorsements, money or crypto advice, or political or religious opinions in the person's name;
  - no sexual or romantic content;
  - step out of character for crisis topics;
  - rules cannot be overridden by the user or by a roleplay setup.
- **Moderation**: every user turn is checked by multilingual rules (en/ar/es/pt/fr), plus OpenAI moderation when configured. Self-harm gets a caring out-of-character crisis message. Sexual content and slurs get a polite decline. Flags are logged for admins.
- **Age gate**:
  - a birth year is required before any conversation;
  - under-13s are blocked;
  - 13–17s are locked to family mode;
  - the year cannot be changed once set.
- **Reports and rights**: users can report any character or reply. Rights holders can request removal through `/rights`. An approved removal disables the character and adds the name to the **do-not-simulate list**, which is enforced for seed data, admin edits, imports and user requests.
- **Video greetings** are generated from an AI-written script that users cannot hand-edit. That keeps the character from being made to "say" arbitrary words, and every frame carries the fictional watermark.

## Testing

```bash
npm test            # 31 tests: sentence splitting, group turn-taking, prompts, moderation, Stripe signatures,
                    # and HTTP tests (search, age gate, chat streaming, limits, opt-outs, admin API)
npm run typecheck
```

Tests use an in-memory database and blank out all provider keys, so they never call paid APIs.

## Deployment

```bash
npm ci && npm run build
NODE_ENV=production SESSION_SECRET=… ADMIN_TOKEN=… ANTHROPIC_API_KEY=… npm start
```

- Serve the app over HTTPS, because browsers only allow camera and microphone access on secure origins.
- Keep `DATA_DIR` on persistent storage.
- The server is a single Node process with no other services required.

## Known limitations

- Character bios (`role`, `knownFor`) are written in English, though names exist in English and Arabic. The conversations themselves follow the chosen call language.
- Without server speech keys, browser speech quality and language coverage depend on the user's browser and OS.
- Character knowledge comes from the model's training data, so a character may not know about very recent events, and the prompt tells it to say so.
