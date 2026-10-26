# Murattil · مُرتِّل

A Quran recitation practice app. Recite in your own voice and get honest Tajweed feedback. Listen ayah by ayah to famous reciters. Hear your own recitation transformed toward a reciter-inspired vocal style.

The app is free to use within published daily limits. Everything runs on a single server: a FastAPI back end, a React front end, and AI models that run on the CPU.

![Murattil: home, Quran reader with tajweed colours, Tajweed Coach feedback, Voice Studio result, Arabic RTL, dark mode](docs/screenshots.jpg)
![Mobile layout](docs/screenshots-mobile.jpg)

*Screenshots from the Playwright run in the development environment. The reciter audio hosts were not
reachable there, so the Voice Studio's "reference reciter" was a local stand-in serving LibriSpeech
speech; the recitation analysed in the Coach was synthetic (eSpeak NG) audio fed through the browser's
fake microphone.*

```
murattil/
  server/   Python: API, background jobs, audio + AI pipelines, tests
  web/      React + TypeScript single-page app
  scripts/  data build (Quran text, tajweed spans)
```

## What is real, and how it was verified

| Feature | What actually runs | How it was verified in development |
| --- | --- | --- |
| **Voice Studio: neural blend** | kNN-VC (WavLM-Large layer 6 + HiFi-GAN, MIT). Frames of your recitation are blended with their nearest neighbours from the reciter's reference audio: `(1−λ)·you + λ·kNN(reciter)`. | Real weights on real speech. Resynthesis stays you (speaker similarity 0.96). Full conversion becomes the target speaker (0.93). A 35% blend gives 0.88 to you and 0.71 to the reference (was 0.61 before). |
| **Voice Studio: style transfer** | WORLD vocoder analysis and resynthesis: pitch register (kept in *your* octave), melodic range, DTW-aligned melody and timing transfer from the same passage, formant resonance, spectral warmth, smoothness, vibrato on held notes | Each control is measured on the output. +4 st in gives +4.08 st out. Resonance −1 scales formants ×0.885. Pace ×1.25 gives ×1.25 duration. Against a deliberately inverted reference melody, contour correlation goes from −0.92 (original) to +0.86 (output), still in the user's register. |
| **Identity guard** | Resemblyzer speaker encoder. A blend toward a reciter who has not authorised a voice model must stay ≥ 0.70 similar to the user *and* closer to the user than to the reciter, or it is reduced and finally withheld. Fails closed. | Tested with real weights, with random-weight (noise) output, and with white noise. |
| **Tajweed Coach: words** | Quran FastConformer CTC (Tilawa project, MIT / NVIDIA CC-BY-4.0). Forced alignment of the expected ayahs, with the basmalah optional. Free transcription is compared word by word. Missed, extra, substituted and unclear words each get a confidence. | Real model on synthetic Arabic speech (eSpeak NG). It detects a deliberately omitted word (1:5 «نعبد»), aligns 88% of a complete passage, and correctly picks the basmalah before Al-Ikhlāṣ. **Not yet evaluated on human recitation:** no recitation audio was reachable from the build environment. |
| **Tajweed Coach: rules** | Conservative acoustic measurements inside aligned words, measured in counts of the reciter's own tempo: madd length (≥ 4-count madds), ghunnah duration, qalqalah release. Never more than "medium" confidence. | Unit-tested logic only. These are heuristics, not a trained tajweed classifier. The UI labels them as such and always recommends a teacher. |
| **Quran text** | KFGQPC Uthmanic Hafs v3.0 (via `@quran.ws/text`, CC BY 4.0), rendered in the KFGQPC Hafs font, with 147,234 tajweed spans from the quran.ws corpus (CC BY 4.0) | The build script checks the letter skeleton of all 6,236 ayahs against the independent Tanzil text (all 6,236 match). It validates every checkable tajweed span and refuses to write output on failure. 20:1 and 27:20 get no colouring because their spans did not validate. |
| **Reciters** | 28 reciters, including Ahmed Al-Nufais, Alafasy, Al-Sudais, Al-Muaiqly, Al-Dosari, Islam Sobhi, Al-Minshawi, Al-Husary, Abdul Basit, Al-Ghamdi, Al-Qatami and Bandar Baleela. Audio streams from everyayah.com (per ayah) or the mp3quran.net API (per surah, with ayah timings where published). | Playback, repeat and range logic were exercised in the browser. **The audio hosts were blocked from the build environment**, so EveryAyah folder names and mp3quran name matching were not checked live. The server checks every source every 6 h and the UI marks unreachable ones. |

How outputs are labelled:

- **"Style-inspired AI voice blend":** the neural stage ran and passed the identity check.
- **"Style-inspired transformation (signal processing — no neural voice conversion)":** the neural stage was off, unavailable or rejected.
- **Reference playback:** always shown separately.

Every transformed file carries a disclaimer: on screen, and inside the WAV (`LIST/INFO/ICMT`). No reciter has authorised a voice model, so full voice conversion is disabled for all of them.

## Run it

Requirements: Python 3.11+, Node 20+, ffmpeg.

```bash
cd server
python -m venv .venv && . .venv/bin/activate
pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu   # CPU build, optional but much smaller
pip install -r requirements-dev.txt
python scripts/fetch_models.py        # ~1.4 GB: kNN-VC (GitHub releases of bshall/knn-vc) + Quran ASR (yazinsai/tilawa v0.2.0)

cd ../web && npm ci && npm run build   # builds web/dist, served by the API server
cd ../server && MURATTIL_SECURE_COOKIES=0 uvicorn murattil.main:app --port 8000   # http://localhost:8000
```

Notes:

- **Without the model files the app still runs.** The Studio uses signal processing only, and the Coach checks recording quality only. Both say so in the UI.
- **Development:** run `npm run dev` in `web/`. It proxies `/api` to port 8000.
- **Docker:** `Dockerfile` builds a single container. It was not built in the development environment, which had no Docker daemon.

### Configuration (environment variables)

| Variable | Default | |
| --- | --- | --- |
| `MURATTIL_VAR_DIR` | `server/var` | SQLite database, private recordings, caches |
| `MURATTIL_MODELS_DIR` | `server/models` | model weights |
| `MURATTIL_WEB_DIST` | `web/dist` | built front end |
| `MURATTIL_SECURE_COOKIES` | `1` | set `0` only for plain-http local development |
| `MURATTIL_WORKERS` / `MURATTIL_TORCH_THREADS` | `2` / `2` | background AI workers and threads per worker |
| `MURATTIL_MAX_QUEUE` | `50` | refuse new AI jobs above this queue length |
| `MURATTIL_FREE_*`, `MURATTIL_SUPPORTER_*` | see `config.py` | fair-usage limits |
| `MURATTIL_ADMIN_TOKEN` | unset | enables `POST /api/admin/reciters/health` |

## Fair usage

Free plan, per account per UTC day:

- 30 Tajweed analyses and 8 voice transformations.
- Recordings up to 120 s (analysis) and 45 s (transformation).
- 300 MB of storage, 100 saved recordings.

A job reserves one unit when it is queued and refunds it if it fails or is cancelled. The UI shows the limits and current usage.

The "Supporter" plan has higher limits but **is not for sale**: there is no payment integration. It can only be assigned by the operator.

Measured CPU timings (4 cores) for a 16–17 s recording:

- Tajweed analysis: about 6 s.
- Style transformation: about 30 s.
- With the neural blend and identity check: 40–60 s.

## Privacy and security

- **Accounts:** every visitor gets a private anonymous account (http-only, SameSite=Lax session cookie). Adding an email and password is optional; passwords are hashed with scrypt.
- **Recordings:** only ever served to their owner. Deleting a recording removes its files immediately, and deleting the account removes everything.
- **Requests:**
  - State-changing API calls require an `X-Requested-With` header, which blocks cross-site form posts.
  - Uploads are size-capped before they are read.
  - ffmpeg decodes uploads with only the `pipe` protocol allowed, so a disguised playlist cannot read local files or URLs.
  - Server-side reference fetches go only to allow-listed HTTPS hosts, with every redirect hop checked.
- **Headers:** a strict Content-Security-Policy, `nosniff`, `frame-ancestors 'none'`.

## Authorised voice models

Full conversion toward one specific person's voice is only possible for voice banks registered with documented consent:

```bash
python -m murattil.voice.registry add --id <id> --name-en "..." --audio-dir <licensed audio> \
    --consent-document consent.pdf --granted-by "Full Name" --signed-at 2026-01-31 [--expires-at ...]
python -m murattil.voice.registry list | revoke --id <id>
```

The manifest stores the consent document's SHA-256. A model is not loaded if its consent is missing, expired, revoked, out of scope, or the document was altered.

## Tests

```bash
cd server
pytest                                              # 57 tests (real LibriSpeech speech, local stand-in audio host)
MURATTIL_REAL_MODELS=1 pytest tests/test_real_models.py   # against the downloaded weights
```

During development the whole app was also driven in Chromium with Playwright:

- Recording through the AudioWorklet recorder (fake microphone device), followed by Tajweed analysis with the real recogniser.
- Upload, voice comparison and neural transformation in the Studio.
- Every page in English and Arabic (RTL), light and dark, desktop and mobile, with no page errors.

## Sources and licences

- Quran text: KFGQPC Uthmanic Hafs v3.0, packaged by quran.ws (CC BY 4.0). Cross-check: Tanzil Project (CC BY 3.0).
- Tajweed rules: quran.ws tajweed corpus, derived from tajweed.quranpedia.net (CC BY 4.0).
- Font: KFGQPC Uthmanic Script HAFS (King Fahd Glorious Quran Printing Complex). Amiri, IBM Plex Sans Arabic, Inter (OFL).
- Recitations: streamed from everyayah.com and mp3quran.net and not rehosted; rights remain with the reciters and publishers. **Before charging for anything, confirm the terms of each audio source.**
- Models: kNN-VC and WavLM (MIT, code vendored in `server/murattil/voice/knnvc`), Tilawa FastConformer (MIT / CC-BY-4.0), Resemblyzer (Apache-2.0), Silero VAD (MIT), WORLD (modified BSD).
- Test audio: LibriSpeech (CC BY 4.0) via librosa's example data; synthetic Arabic from eSpeak NG.

## Known limitations

- **Coach accuracy on real recitation is unmeasured.** It needs an evaluation set of human recitations with teacher-marked mistakes before its numbers can be trusted.
- **Tajweed rule checks are heuristic.** They cover madd length, ghunnah and qalqalah only. Makharij feedback is advisory: it is shown for unclear or substituted words and does not detect a specific articulation error.
- **The neural blend outputs 16 kHz audio** (8 kHz bandwidth); the signal-processing path runs at 24 kHz.
- **Melody and timing transfer need the same passage** as the reference. Recordings that don't match are detected and the transfer is skipped, with a note in the result.
- **Audio-source identifiers are unchecked:** EveryAyah folder names and mp3quran names were not verified against the live services from the build environment.
