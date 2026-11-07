# PLAN.md — LinguaCall development plan (living document)

> **This is the canonical plan.** Every agent/developer picks up work from here.
> Russian mirror: [PLAN.RU.md](PLAN.RU.md) (may lag behind; English wins on conflict).
>
> - **Selected architecture: variant A — "everything in the browser"** (no servers,
>   no paid services).
> - **Current course (decision D19): translation-first.** Get the core feature
>   working end-to-end first — speech → subtitles → translated **voice** with
>   minimal latency — using the simplest possible audio/video transport
>   (manual WebRTC). `go-p2p-netcat` integration is **deferred** (D19/D2).
> - **Main feature: live dubbing.** The user must *hear* the translation in their
>   native language, not only read subtitles (D17).
> - **Toolchain: Bun** (runtime, package manager, `bun test`); Node/pnpm are not
>   used (D18).
> - **Documentation policy:** English is primary; Russian mirrors are kept as
>   `*.RU.md` (D21). All code comments are English.
> - Version: `v1.1` · Last update: **2026-11-07**
> - **Next step: P5P-02** (mic capture + energy VAD segmenter), then P5P-03 (Web Speech ASR).

---

## 0. How to pick up work (handoff protocol)

1. Read sections 1–6 and 9, plus [docs/PROPOSALS.md](docs/PROPOSALS.md) and
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Open section 9 "Current state": it names the next step.
3. Find in section 8 the first `☐ TODO` task whose dependencies are `✅ DONE`.
   Task status is the only source of truth, not memory.
4. Move the task to `▶ DOING`, add a line to the journal (section 10).
5. Do **exactly** that task. If it grows beyond one commit, split it in the
   backlog into subtasks instead of one huge commit.
6. Commit using section 6 conventions, then set `✅ DONE (date, hash)`.
7. Update section 9 and the journal. If a decision changed, update section 2.
8. Only then take the next task.

**Rules.** Never delete history; do not rewrite someone else's journal entries;
record architecture-changing decisions in section 2 with a date; mark blocked
tasks `⛔ BLOCKED` with a reason; one backlog task = one commit.

---

## 1. Product

### 1.1. What we build

A browser-only P2P video call app with automatic real-time speech translation:
the other participant's speech is transcribed, translated into the user's native
language, shown as subtitles **and spoken aloud** (dubbing). No paid APIs, no
servers, no accounts. Speech processing runs on the user's device (final target:
local WASM models; the prototype may temporarily use built-in browser APIs).

### 1.2. User flow (required)

1. **Screen 1 — native language.** Pick the language; UI switches to it; choice
   is persisted.
2. **Screen 2 — create/join.** Create a chat → get an invite token/link; or join
   by token.
3. **Screen 3 — camera & microphone.** Device selection, preview, mic level,
   error states.
4. **Screen 4 — call.** Remote + local video, subtitles on by default
   (original + translated), **dubbing on**: translated speech is audible, the
   original is ducked. Subtitle/dubbing settings live in the call.

For the current phase, a temporary **simple WebRTC call** screen is available
from the lobby to test media without any signaling server: participants exchange
copyable SDP codes manually.

### 1.3. Non-goals (first version)

- Servers of any kind (signaling/translation/TURN). Self-hosted components are
  future work.
- Group calls, recording, accounts, cloud history, screen sharing, file transfer.
- Native desktop/mobile apps (PWA only).
- Guaranteed connectivity under symmetric NAT without TURN (honest UI warning).

### 1.4. MVP success criteria

- Two users connect and see/hear each other.
- Subtitles: end-of-utterance latency ≤ 2 s (p90), partial hypotheses ≤ 1 s.
- **Dubbing latency ≤ 2.5 s (p90)** from end of phrase to audible translated
  speech; speech is intelligible, original is ducked, queue does not stutter.
- Works with no paid services; no server required.
- Reconnect after a short network drop without losing the call (within the
  transport's limits).
- Latency, packet loss and quality are measured locally and visible in
  diagnostics.

### 1.5. MVP assumptions

- Language pair: **ru↔en** first (manifest-driven capability list).
- Desktop Chrome/Edge are the primary target; Firefox/Safari best-effort.
- Prototype translation engines may use built-in browser APIs (D22) until local
  WASM engines are integrated (P5A/P5T).
- Manual WebRTC transport is temporary and only needs to be "good enough" to
  test translation across two machines (D20).
- Project is non-commercial (owner's answer).

---

## 2. Decisions (ADR-lite)

Statuses: `ACCEPTED`, `PENDING`, `DEFERRED`, `REJECTED`, `REVISED`.

| ID | Status | Decision | Why / consequences |
|---|---|---|---|
| D1 | ACCEPTED | Variant A: browser-only app; WebCodecs media eventually, WASM models, no servers | Owner's choice; lowest infrastructure cost, highest realtime risk. |
| D2 | DEFERRED | Transport: `go-p2p-netcat` (libp2p + pairing tokens) | Deferred by D19: first get translation working over a minimal transport. Keep wire invariants untouched. |
| D3 | DEFERRED | Custom framed control protocol over `p2p-nc` stream (HELLO/SDP/ICE/SUBTITLE) | Needed when P2N starts; prototype uses local events/in-memory pipeline. |
| D4 | ACCEPTED | Sender-side speech pipeline: each participant recognizes their own microphone and translates into the peer's language | Own language is known → faster/specialized streaming ASR; no second audio transmission; better privacy. |
| D5 | ACCEPTED | Engine interfaces (`AsrEngine`, `MtEngine`, `TtsEngine`) are pluggable; prototype engines first, local WASM engines later | Keeps the core feature replaceable without rewriting UI. |
| D6 | ACCEPTED | Monorepo: `apps/web` + `packages/*` + `docs/*` | Small packages = small commits; reuse across future shells. |
| D7 | ACCEPTED | Language support is described by a capability manifest | Never promise a language pair that is not available. |
| D8 | ACCEPTED | ICE: public STUN by default, configurable list; TURN absent; symmetric NAT → honest error | No servers in variant A. |
| D9 | ACCEPTED | No network telemetry; local metrics and logs only | "No third-party services" + privacy. |
| D10 | DEFERRED | CBOR framing over the P2P control channel | Only needed for P2N; prototype uses plain JSON events locally. |
| D11 | ACCEPTED | Model licenses: MIT/Apache-2.0/MPL-2.0/CC-BY by default; NC/GPL/AGPL only by separate decision; `docs/LICENSES.md` + CI check | Non-commercial project, but keep the license path safe. |
| D12 | DEFERRED | Media multiplexed into one data channel (WebCodecs over `WebRtcStream`) | Revisit when/if p2p-netcat media path is needed. |
| D13 | DEFERRED | Identity in IndexedDB; invite token only in URL `#fragment` | Required for real pairing (P2N). |
| D14 | DEFERRED | Capture via `MediaStreamTrackProcessor` with `<video>`+rVFC fallback | Needed for WebCodecs media path. |
| D15 | DEFERRED | Mandatory spikes before committing to WebCodecs/WASM paths | Spikes deferred together with P3A/P5A/P5T. |
| D16 | ACCEPTED | `MediaTransport` interface isolates transport choice (manual WebRTC now, p2p-netcat later) | Prevents UI rewrite when transport changes. |
| D17 | ACCEPTED | **Dubbing is a first-class MVP feature**: receiver synthesizes translated text and plays it; original is ducked | Owner's main requirement: hear the translation. |
| D18 | ACCEPTED | **Bun** replaces Node/pnpm: workspaces, `bun.lock`, `bun test` + Testing Library/happy-dom, CI via `oven-sh/setup-bun`; `bun x --bun` for Vite/tsc/ESLint | Owner's requirement; one tool for runtime, packages, tests. |
| D19 | **ACCEPTED 2026-11-07** | **Translation-first course**: defer `go-p2p-netcat`; use the simplest audio/video transport (manual WebRTC) to test the core feature; integrate p2p-netcat later (P2N) | Owner's instruction: focus on automatic translation/dubbing with minimal latency. |
| D20 | **ACCEPTED 2026-11-07** | Temporary transport: manual WebRTC signaling — SDP invite/answer codes exchanged by copy/paste; STUN only; audio+video tracks | Zero servers, works across two machines; enough to validate media + translation. Symmetric NAT may fail; not a final solution. |
| D21 | **ACCEPTED 2026-11-07** | **Documentation is English-primary**, Russian mirrors kept as `*.RU.md`; all code comments in English | Owner's requirement. Russian mirror may lag; English wins. |
| D22 | **ACCEPTED 2026-11-07** | Prototype engines: Web Speech API for ASR, Chrome/Edge built-in Translator API for MT, Web Speech Synthesis for TTS; feature-detect + clear fallbacks | Fastest path to a real end-to-end demo with no model downloads. **Prototype only**: Web Speech ASR may use vendor cloud, so final version must switch to local WASM engines (P5A/P5T) to satisfy the no-third-party rule. |
| D23 | **ACCEPTED 2026-11-07** | **Latency budget** for the prototype: partial ASR ≤ 300 ms, final ASR ≤ 700 ms after speech end, MT ≤ 150 ms, TTS start ≤ 300 ms; target end-to-end dubbing ≤ 1.5 s (p50), ≤ 2.5 s (p90) | The main feature must feel live; every pipeline stage gets timestamps and local metrics. |

---

## 3. Architecture (current prototype)

### 3.1. Layers

```
apps/web                    React+TS UI: language/lobby/call/dubbing UI, i18n
packages/session-core       call state machine, settings, capability manifest
packages/translation        engine interfaces + pipeline + latency metrics
packages/i18n               UI strings (ru/en)
apps/web/src/media          temporary manual-WebRTC transport (SDP codes)
apps/web/src/ui             design system
```

Future/deferred packages: `transport-p2p` (go-p2p-netcat), `media-dc` (WebCodecs),
`asr-wasm`/`mt-wasm`/`tts-wasm` (local WASM engines).

### 3.2. Temporary media transport (D20)

- Two participants exchange copyable SDP codes: caller creates an offer code,
  callee pastes it and returns an answer code.
- `RTCPeerConnection` with public STUN, one audio track and one video track;
  `echoCancellation`, `noiseSuppression`, `autoGainControl` enabled.
- Codes are `LC1.` + base64url(UTF-8 SDP), validated on decode.
- Limitations: manual copy/paste, no reconnect, symmetric NAT may fail.
  Acceptable only until P2N.

### 3.3. Translation pipeline (main feature, to be built in P5P)

```
mic (WebAudio) → VAD/segmenter → ASR (partial/final)
   → MT (peer's language) → subtitles + TTS queue
   → WebAudio: translated voice 100% + remote original ducked (20–30%)
```

- Every stage emits `{ stage, tStart, tEnd }` timestamps; the UI shows p50/p90
  latency per stage and end-to-end.
- Dubbing policy: only final segments are spoken; short segments are merged;
  outdated queue entries are dropped; the original remote audio is gain-ducked
  while translated speech plays.
- The pipeline must be testable with mock engines in `bun test`.

### 3.4. Future path (deferred)

- **P2N**: `go-p2p-netcat` transport — pairing tokens, native WebRTC data channel
  for control/subtitles (and later media), replacing manual SDP exchange.
- **P5A/P5T**: local WASM engines (sherpa-onnx/Vosk streaming ASR, Bergamot MT,
  sherpa-onnx VITS TTS) to remove prototype cloud/vendor dependencies.
- **P3A**: WebCodecs media over the data channel (only if native WebRTC is not
  available/blocked).

---

## 4. Stack & environment

### 4.1. Base

| What | Value |
|---|---|
| **Bun** | ≥ 1.2 (dev machine: 1.4.0) — runtime, package manager, test runner |
| Workspaces | `bun install`, `bun.lock` |
| Language | TypeScript 5.9, strict |
| UI | React 19 + Vite 7 |
| Tests | `bun test` + Testing Library + happy-dom (jsdom not used) |
| Lint/format | ESLint + Prettier via `bun x` |
| Git | Conventional Commits, small commits |

### 4.2. Prototype engines (D22) and final engine plan

| Stage | Prototype (now) | Final (later, must be local) |
|---|---|---|
| VAD | energy-based segmenter (WebAudio) | Silero VAD WASM |
| ASR | Web Speech API (Chrome/Edge, partials) | sherpa-onnx/Vosk WASM streaming |
| MT | Chrome Translator API (on-device, Chrome/Edge) | Bergamot WASM, M2M100/node fallback |
| TTS | Web Speech Synthesis (system voices) | sherpa-onnx VITS (piper voices) |

Browser support for the prototype: Chrome/Edge desktop are the primary target.
Firefox/Safari fall back to "subtitles only" or show a clear unsupported message.
**Note:** Web Speech ASR may send audio to a vendor cloud in some browsers; this
is acceptable only for the prototype and must be replaced before release (D11,
D22). The final build must not use third-party services.

### 4.3. Dev commands

```bash
bun install
bun run dev       # UI at http://localhost:5173
bun run typecheck
bun run lint
bun test
bun run build
```

---

## 5. Repository structure

```
.
├── README.md / README.RU.md
├── PLAN.md / PLAN.RU.md
├── AGENTS.md / AGENTS.RU.md
├── docs/
│   ├── ARCHITECTURE.md / .RU.md
│   ├── PROPOSALS.md / .RU.md
│   ├── RESEARCH.md / .RU.md
│   ├── PROTOCOL.md (later, P2N)
│   ├── LICENSES.md (later)
│   └── spikes/ (later)
├── apps/web/
│   ├── src/screens/        language, lobby, manual call, devices, call
│   ├── src/media/          temporary manual-WebRTC transport
│   ├── src/router/         typed router + guards
│   ├── src/storage/        preferences
│   ├── src/token/          invite token helpers (mock until P2N)
│   └── src/ui/             design system
├── packages/
│   ├── i18n/               UI strings
│   └── translation/        (P5P) engine interfaces + pipeline + metrics
└── scripts/
```

---

## 6. Conventions

### 6.1. Commits

- Conventional Commits: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`,
  `build`, `perf`.
- `<type>(<scope>): <summary>` + body + `Refs: P5P-03`.
- One backlog task per commit; do not commit models, secrets, tokens,
  `node_modules`, `dist`, binaries.

### 6.2. Documentation & comments

- **All documentation is English-primary**; keep Russian mirrors as `*.RU.md`.
  When changing a doc, update the English file first; update the Russian mirror
  in the same or the next commit (it may lag briefly; English wins).
- **All code comments, JSDoc, commit messages in English.** UI strings live in
  `packages/i18n` (ru+en) and are the only place with non-English text.

### 6.3. Code

- TypeScript strict; no `any` without a reason; ESLint/Prettier.
- All UI text through `@linguacall/i18n`.
- Public package APIs via `src/index.ts`; typed errors; no speech content in
  info-level logs.

### 6.4. Tests

- Unit tests with `bun test` (+ Testing Library/happy-dom for UI); pipeline tests
  with mock engines; protocol codecs get round-trip tests.
- Browser-only code (WebRTC, Web Speech) is isolated behind thin adapters so most
  logic stays unit-testable.

---

## 7. Roadmap (translation-first)

| Phase | Content | Status |
|---|---|---|
| **P0** | Bootstrap: repo, Bun tooling, CI, docs | ✅ 12/12 |
| **P1** | UI shell and flow (language, lobby, subtitles/dubbing UI) | ▶ 5/12 |
| **P2S** | Simple manual-WebRTC transport (temporary) | ▶ 4/6 |
| **P5P** | **Prototype translation pipeline + dubbing (main feature)** | ☐ 0/10 |
| **P4** | Real device selection/permissions/checks | ☐ 0/7 |
| **P6** | Hardening: latency, reconnect, diagnostics, long calls | ☐ 0/9 |
| **P7** | Build, hosting, docs, demo | ☐ 0/6 |
| **Later** | P2N (go-p2p-netcat), P5A (local ASR/MT), P5T (local TTS), P3A (WebCodecs), variants B/C/D | — |

Sizes: `S` ≤ ~150 lines, `M` ~150–400, `L` > 400 (split L before starting).

---

## 8. Backlog

Statuses: `☐ TODO`, `▶ DOING`, `✅ DONE`, `⛔ BLOCKED`.

### P0 — Bootstrap (done)

| ID | Status | Task |
|---|---|---|
| P0-01 | ✅ DONE (2026-11-07, 8abff3d) | Git repo, `.gitignore`, `.editorconfig`, MIT license |
| P0-02 | ✅ DONE (2026-11-07, b667e7f) | Workspace + root scripts |
| P0-03 | ✅ DONE (2026-11-07, 64bcd71) | TypeScript/ESLint/Prettier strict configs |
| P0-04 | ✅ DONE (2026-11-07, 024e05b) | CI workflow |
| P0-05 | ✅ DONE (2026-11-07, 46f165b) | React 19 + Vite 7 app shell |
| P0-06 | ✅ DONE (2026-11-07, 9c1d74b) | i18n package (ru/en, typed keys) |
| P0-07 | ✅ DONE (2026-11-07, fb634a4) | Test runner + smoke tests |
| P0-08 | ✅ DONE (2026-11-07, 2165671) | Architecture doc |
| P0-09 | ✅ DONE (2026-11-07, 44221ee) | Toolchain prerequisite script |
| P0-10 | ✅ DONE (2026-11-07, a17538c) | README with quick start |
| P0-11 | ✅ DONE (2026-11-07, ae47094) | AGENTS.md handoff instructions |
| P0-12 | ✅ DONE (2026-11-07, 59746bb) | Bun migration (D18): workspaces, `bun test`, CI |

### P1 — UI shell and flow

| ID | Status | Task | Depends | DoD |
|---|---|---|---|---|
| P1-01 | ✅ DONE (2026-11-07, 5ba94d5) | Router + screen guards | P0-05 | 4 routes, guard tests |
| P1-02 | ✅ DONE (2026-11-07, 383df72) | Native language screen (search, persist) | P1-01, P0-06 | selection persisted, UI language changes |
| P1-03 | ✅ DONE (2026-11-07, 5ba167a) | Design tokens + base UI kit | P0-05 | kit + `#kit` gallery + tests |
| P1-04 | ✅ DONE (2026-11-07, 230f917) | Create-chat screen (mock token, share link) | P1-01 | token copied, link generated |
| P1-05 | ✅ DONE (2026-11-07, 230f917) | Join-by-token screen (validation, hash prefill) | P1-01 | clear validation errors |
| P1-06 | ☐ TODO | Devices screen (mock list, preview stub) | P1-01 | device choice kept in state |
| P1-07 | ☐ TODO | Call layout (remote/local video, controls) | P1-01 | static layout |
| P1-08 | ☐ TODO | Subtitle component (original/translated, partial/final) | P1-07 | render-state tests |
| P1-09 | ☐ TODO | Subtitle + dubbing settings panel | P1-08 | settings applied & persisted |
| P1-10 | ☐ TODO | Session state machine (idle→lobby→devices→call→ended) | P0-03 | transition tests |
| P1-11 | ☐ TODO | Settings store with persistence | P1-02 | persist + schema migration |
| P1-12 | ☐ TODO | E2E happy path over all screens (mock transport) | P1-04…P1-09 | test green in CI |

### P2S — Simple manual-WebRTC transport (temporary, D20)

| ID | Status | Task | Depends | DoD |
|---|---|---|---|---|
| P2S-01 | ✅ DONE (2026-11-07, 10f7b43) | SDP code codec (`LC1.` + base64url), validation | — | round-trip + malformed tests |
| P2S-02 | ✅ DONE (2026-11-07, 10f7b43) | Caller/callee `RTCPeerConnection` sessions, local tracks, ICE gather | P2S-01 | offer/answer codes generated |
| P2S-03 | ✅ DONE (2026-11-07, 10f7b43) | Manual call screen (create/join, preview, mute/camera/hangup) | P2S-02 | video/audio call possible |
| P2S-04 | ✅ DONE (2026-11-07, 10f7b43) | Lobby entry + router guard for the temporary call | P2S-03 | reachable from lobby |
| P2S-05 | ☐ TODO | Two-machine smoke test (documented manual checklist) | P2S-04 | `docs/TESTING.md` checklist |
| P2S-06 | ☐ TODO | Data channel in the manual session (text subtitles for remote dubbing tests) | P2S-04 | text arrives to the peer |

### P5P — Prototype translation pipeline + dubbing (main feature)

| ID | Status | Task | Depends | DoD |
|---|---|---|---|---|
| P5P-01 | ✅ DONE (2026-11-07, daf2841) | `packages/translation`: `AsrEngine`/`MtEngine`/`TtsEngine` interfaces, capability manifest, latency types | — | unit tests for contracts |
| P5P-02 | ☐ TODO | Mic capture + energy VAD segmenter (WebAudio, testable pure logic) | P5P-01 | segmenter unit tests |
| P5P-03 | ☐ TODO | Web Speech ASR adapter (partial/final, feature detection, errors) | P5P-01 | works in Chrome/Edge; fallback message |
| P5P-04 | ☐ TODO | Chrome Translator API MT adapter + fallback path | P5P-01 | ru↔en translation in Chrome/Edge |
| P5P-05 | ☐ TODO | Web Speech Synthesis TTS adapter with queue/merge/interrupt policy | P5P-01 | speaks translated segments |
| P5P-06 | ☐ TODO | Pipeline orchestration: mic→VAD→ASR→MT→subtitle+TTS; per-stage latency metrics | P5P-02…P5P-05 | mock-engine pipeline tests |
| P5P-07 | ☐ TODO | Live translation demo screen (mic → subtitles → dubbed voice, latency panel) | P5P-06 | real demo works |
| P5P-08 | ☐ TODO | Dubbing audio graph: duck remote original, mix translated voice, echo safety | P5P-05, P5P-07 | both voices mixed correctly |
| P5P-09 | ☐ TODO | Latency tuning to budget (D23): chunking, throttling, endpointing | P5P-06 | measured p50/p90 in `docs/PERF.md` |
| P5P-10 | ☐ TODO | Error/degradation states: no engine/no mic/unsupported browser; subtitles-only mode | P5P-03…P5P-06 | 4 scenarios covered |

### P4 — Devices, permissions, camera/mic checks

| ID | Status | Task | Depends | DoD |
|---|---|---|---|---|
| P4-01 | ☐ TODO | `enumerateDevices` + permissions + denial handling | P1-06 | permission states in UI |
| P4-02 | ☐ TODO | Real camera preview on the devices screen | P4-01 | preview works |
| P4-03 | ☐ TODO | Mic level meter + "hear yourself" loopback test | P4-01 | level moves, loopback works |
| P4-04 | ☐ TODO | Persist chosen devices + `devicechange` handling | P4-02 | devices switch without reload |
| P4-05 | ☐ TODO | Error states: none/busy/denied/no-permission | P4-01 | 4 scenarios tested |
| P4-06 | ☐ TODO | Constraint profiles (720p/30, 480p/15) | P4-02 | profiles applied |
| P4-07 | ☐ TODO | Device switching during a call, mute/camera off | P4-04, P1-07 | no call loss |

### P6 — Hardening and quality

| ID | Status | Task | Depends | DoD |
|---|---|---|---|---|
| P6-01 | ☐ TODO | Connection drop handling (call survives short drops within transport limits) | P2S-04, P5P-08 | network-kill test |
| P6-02 | ☐ TODO | Tab close/app exit: release devices, stop pipeline | P6-01 | no stuck calls |
| P6-03 | ☐ TODO | Long call (30+ min): leaks, queues, memory | P6-02 | report + fixes |
| P6-04 | ☐ TODO | Local diagnostics panel + log export without speech content | P5P-06 | export works |
| P6-05 | ☐ TODO | E2E two-browser test: language→lobby→manual call→subtitles/dubbing | P5P-07, P2S-04 | stable green test |
| P6-06 | ☐ TODO | Fuzz/property tests for token and SDP code parsers | P2S-01 | CI run |
| P6-07 | ☐ TODO | Privacy audit: what goes over the network, threat model | P6-04 | `docs/PRIVACY.md` |
| P6-08 | ☐ TODO | 1-hour load check: latency/CPU/memory | P6-03 | measurements in `docs/PERF.md` |
| P6-09 | ☐ TODO | Hot-path profiling (pipeline/TTS) + optimizations | P6-08 | within budget |

### P7 — Build, packaging, docs

| ID | Status | Task | Depends | DoD |
|---|---|---|---|---|
| P7-01 | ☐ TODO | Versioning and changelog | P6-05 | semver + CHANGELOG |
| P7-02 | ☐ TODO | Production web build + hosting guide | P0-05 | `bun run build` + docs |
| P7-03 | ☐ TODO | User guide (EN+RU): setup, invite codes, browser support, NAT | P7-02 | `docs/USER_GUIDE.md` |
| P7-04 | ☐ TODO | Demo video/screenshots + README gif | P7-03 | README updated |
| P7-05 | ☐ TODO | Final audit: licenses, privacy, handoff instructions | P6-07, P5P-10 | checklist closed |
| P7-06 | ☐ TODO | Clean-clone check: clone → install → test → build | P7-02 | reproducible build |

### Deferred (not now)

- **P2N** — `go-p2p-netcat` transport: identity in IndexedDB, real `pnc1_`
  tokens, native WebRTC data channel, HELLO/control protocol, reconnect.
- **P5A** — local WASM ASR/MT (sherpa-onnx/Vosk streaming, Bergamot) to replace
  prototype engines and remove vendor cloud usage.
- **P5T** — local WASM TTS (sherpa-onnx VITS/piper voices) + dubbing graph.
- **P3A** — WebCodecs media over the data channel (fallback when native WebRTC
  is unavailable/blocked).
- Variants B/C/D (native media, desktop, Android) — only if the direction
  changes.

---

## 9. Current state

**Now:** translation-first course (D19). UI shell with language selection and
lobby (mock tokens) is done; a temporary manual-WebRTC call (copyable SDP codes)
works for audio/video. Docs are English-primary with Russian mirrors. The
translation package skeleton (P5P-01) is in place. Next step is the core feature
pipeline: **P5P-02** (mic capture + VAD), then prototype engines (Web Speech ASR →
Chrome Translator → Web Speech TTS) with latency metrics.

**Done:**
- 2026-11-07 — research: `go-p2p-netcat` has no media tracks; data channel is
  ordered reliable; browser listener needs stable identity; `pnc1_` tokens can be
  created in the browser; no TURN. Free ASR/MT/TTS options and licenses catalogued.
- 2026-11-07 — variant A selected by the owner; dubbing confirmed as the main
  feature; project non-commercial.
- 2026-11-07 — P0 complete (12/12) including Bun migration (D18).
- 2026-11-07 — P1-01…P1-05 complete: router, design system, language screen,
  lobby with create/join (mock tokens, invite links).
- 2026-11-07 — P2S-01…P2S-04 complete: manual-WebRTC audio/video transport
  (`LC1.` SDP codes), temporary call screen, lobby entry.
- 2026-11-07 — docs converted to English-primary with `*.RU.md` mirrors (D21).
- 2026-11-07 — P5P-01 complete: `@linguacall/translation` with engine interfaces,
  segment/latency types and the ru/en capability manifest (32 tests green).

**Next step:** P5P-02 → P5P-03 → … (see §0).

**Known issues / blockers:**
- Manual transport has no reconnect and fails on symmetric NAT (acceptable for
  the prototype).
- Web Speech ASR may use a vendor cloud in some browsers → prototype only;
  final build needs local engines (P5A/P5T).
- Chrome Translator API is Chrome/Edge-only; Firefox/Safari fall back to
  subtitles-only / unsupported message in the prototype.
- `ffmpeg` is absent on the dev machine (may be needed for audio test fixtures).

---

## 10. Session journal

Format: `YYYY-MM-DD · author · what was done · next step`.

- **2026-11-07 · lead** — project docs created; research on `go-p2p-netcat`,
  free ASR/MT/TTS and licenses.
- **2026-11-07 · lead** — variant A chosen; dubbing made a first-class MVP
  feature (D17, phase P5T planned).
- **2026-11-07 · lead** — P0 complete (12/12); Bun migration (D18).
- **2026-11-07 · lead** — P1-01…P1-05 complete; 25 tests.
- **2026-11-07 · lead** — owner changed course: defer p2p-netcat, simplest
  transport first, translation/dubbing as the priority (D19/D20); docs become
  English-primary (D21). Added P2S and P5P phases.
- **2026-11-07 · lead** — P2S-01…P2S-04 complete: manual-WebRTC transport and
  call screen; 29 tests. English README/AGENTS/docs written with RU mirrors.
- **2026-11-07 · lead** — P5P-01 complete: translation engine interfaces,
  segment/latency types, capability manifest; 32 tests. Next: P5P-02 (VAD).

---

## 11. Risks and open questions

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Web Speech ASR/TTS may rely on vendor cloud / be unavailable | High (prototype) | Clearly mark prototype mode; feature-detect; implement local WASM engines (P5A/P5T) before release |
| R2 | Chrome Translator API availability/quality | High | Feature-detect; fallback to subtitles-only; local Bergamot later |
| R3 | Dubbing latency too high | High (main feature) | Latency budget D23, per-stage metrics, partials, queue tuning (P5P-09) |
| R4 | Echo when TTS plays through speakers and mic captures it | Medium | `echoCancellation`, ducking, headphones hint |
| R5 | Manual transport: no reconnect, symmetric NAT failures | Medium | Acceptable for prototype; P2N later |
| R6 | Browser-only code hard to unit test | Medium | Thin adapters + pure logic in testable modules |
| R7 | Model/license complexity when moving to local engines | Medium | D11 + `docs/LICENSES.md` + CI |
| R8 | Russian docs fall behind English | Low | English is canonical; sync RU mirrors at milestones |
| R9 | Scope creep (video quality, p2p-netcat) distracts from translation | High | D19 course; backlog separates deferred work |

**Open questions (defaults chosen, can be changed):**
1. Default dubbing behaviour: original ducked to 20–30%, translated voice 100%.
2. Default voice: system default; user picks voice/rate in settings.
3. Dubbing delay 1–2.5 s vs video: keep video live in MVP; optional video delay
   later.
4. Brand name: keep "LinguaCall".
