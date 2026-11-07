**English** | [Русский](PROPOSALS.RU.md)

> **Course update (2026-11-07, D19/D20):** implementation is translation-first.
> The simplest transport (manual WebRTC with copyable SDP codes) is used for the
> prototype; `go-p2p-netcat` is deferred to P2N. This document is kept as the
> architecture-decision record.

# Architecture options: LinguaCall (P2P video with live speech translation)

> **CLIENT DECISION (2026-11-07): Option A — "everything in the browser" — was chosen.**
> From here on we develop A: media is encoded with WebCodecs and travels over the
> `go-p2p-netcat` data channel, ASR/MT/TTS are WASM models in the browser, no servers.
> **Priority clarification: the main feature is voicing the translation (dubbing), not
> subtitles alone.** TTS is a mandatory part of the MVP: the receiver synthesizes
> the translated text in its own voice (sherpa-onnx WASM VITS / piper voices,
> fallback — Web Speech Synthesis), the original is ducked via WebAudio.
> The description of the options below is kept as the decision history. The work plan is
> [`../PLAN.md`](../PLAN.md) (section 8, tracks P3A/P5A/P5T).

**Status:** decision made (Option A).

- Date: 2026-11-07
- Related documents: [`PLAN.md`](../PLAN.md), [`README.md`](../README.md)
- Transport: [`go-p2p-netcat`](https://github.com/santaklouse/go-p2p-netcat)
- Local copy: `/Users/alexnevpryaga/projects/santaklouse/go-p2p-netcat`

---

## 1. Requirements and constraints

**Functional (from the assignment):**

1. Native language selection screen.
2. "Create chat" screen (get a token and share it) / "connect by token".
3. Camera/microphone selection and check screen.
4. Subtitles turn on automatically and are configurable.
5. Transport — preferably `go-p2p-netcat`.
6. No third-party paid services.

**Non-functional:** operation on real devices, subtitle latency
≤ 2 s, speech privacy, resilience to disconnects, clear NAT errors.

**The two main forks that form the options:**

1. **How media is delivered** (audio/video):
   - **(M1) native WebRTC media** — a separate `RTCPeerConnection` with
     `addTrack()`; SDP/ICE are exchanged over the `go-p2p-netcat` control channel;
   - **(M2) media-over-data-channel** — encode video/audio (WebCodecs) and
     transmit in frames over the same stream.
2. **Where ASR/MT run** (recognition/translation): in the browser (WASM),
   in a desktop app (native models), on one's own server (`lingua-node`).

---

## 2. Verified facts about `go-p2p-netcat` (from the code, 2026-11-07)

| Capability | Status | Comment |
|---|---|---|
| Byte stream by PeerId (`/p2p-netcat/1.0.0/<port>`) | ✅ | TCP, QUIC, WS/WSS, WebTransport, WebRTC Direct, Circuit Relay v2 |
| Native WebRTC **data channel** with PeerId authentication | ✅ | `packages/core/src/native-webrtc.js`; channel `p2p-netcat-v2`, **ordered + reliable** |
| **Audio/video as media tracks (addTrack/ontrack)** | ❌ | The code has neither `addTrack`, nor `ontrack`, nor RTP; SDP is created without `m=audio/video` |
| Browser as a **listener** of native WebRTC | ⚠️ API exists, not used | `startNativeWebRtcListener()` is browser-safe; a stable identity and `createAuthResponse` are needed; works only on the main thread (tab open) |
| Pairing token `pnc1_` created in the browser | ✅ | `createPairingToken({peerId, service, secret, expiresAt})`; token = PeerId + port + 32-byte secret (+relayHints/expiry) |
| Private rendezvous from the token | ✅ | `deriveRendezvousId`, encrypted signaling; audio/bytes do not go through trackers |
| Signaling | ✅ | Public Nostr relays (kind 25050) + WebTorrent trackers; URLs are configurable (can be self-hosted) |
| STUN | ✅ | 9 public STUN servers by default; custom ones — via `rtcConfig` |
| **TURN** | ❌ | No built-in one; under symmetric NAT you need your own coturn (free, self-hosted) |
| Browser→Go | ✅ | Go starts a native listener when a token is present; the PWA already can connect |
| Go as a **media** peer | ❌ | Pion has no AddTrack/OnTrack; for a Go peer to receive video, work is required (+1–2 weeks) |
| Data channel throughput | ⚠️ | flow-window 256 KiB → goodput ≈ window/RTT: at RTT 300 ms that is ≈ 7 Mbit/s |

**Conclusion.** `go-p2p-netcat` perfectly covers **token + discovery +
authentication + a reliable control channel** (SDP/ICE, subtitles, control).
Media must either be carried by a separate native WebRTC connection (M1), or
encoded and carried over the data channel (M2) — but M2 has a bandwidth ceiling and
a complex realtime stack.

**Constraints that must be accepted in any "browser" option:**
the tab must be open (RTCPeerConnection is available only in Window),
mobile background kills the connection, the identity is currently ephemeral (in web/app
`createLibp2p` without a key) → for tokens it must be persisted in IndexedDB.

**External free dependencies that inevitably exist:** public
signaling relays and STUN. They are not paid, but third-party. In all options
we provide for replacement with our own (URL config, self-hosted relay, coturn).

---

## 3. Common core (identical for all options)

- **UI flow:** 4 screens, i18n (ru/en at the start), design system, subtitle
  settings, diagnostics screen.
- **`session-core`:** call state machine, subtitle model, settings,
  events, language capability manifest.
- **`protocol`:** framed protocol over the control channel (`HELLO`, `SDP_OFFER/
  ANSWER`, `ICE_CANDIDATE`, `SUBTITLE`, `CONTROL`, `BYE`), CBOR,
  versioning and compatibility rules.
- **`transport-p2p`:** identity in IndexedDB, creating a chat/token, joining by
  token, listener/connect, reconnect, event bridge to the UI.
- **Engine interfaces:** `AsrEngine` (streaming partial/final), `MtEngine`,
  `TtsEngine` — adapters for each backend. This is exactly why A/B/C/C′ differ
  in engine implementation, not in the whole UI.
- **Privacy/diagnostics:** local ASR/MT/network metrics, logs without
  speech content, no telemetry.

**Important clarification on the subtitle architecture (based on the research):**
each participant recognizes **their own microphone** (their language is known
in advance → a fast streaming ASR can be used for exactly that language), translates
into the interlocutor's language and sends a `SUBTITLE` frame over the control channel. This is better
than recognizing incoming audio: no multilingual ASR is needed, no traffic
is spent on transmitting audio twice, better quality (clean microphone) and privacy.

---

## 4. Free recognition and translation stack (verified)

### 4.1. ASR (speech → text)

| Engine | Languages | Streaming | Size | License |
|---|---|---|---|---|
| **sherpa-onnx** (next-gen Kaldi) | streaming: en, zh, ko, fr, de, es, ru (T-one, 2025-09) | **true streaming + endpointing** | ~70 MB per model (int8) | Apache-2.0 |
| **Vosk** | ~25 languages | **true streaming (partial)** | 31–50 MB small / 0.3–2.3 GB big | Apache-2.0 (some models NC/AGPL — check) |
| **whisper.cpp** | 99 | no (VAD + 1–5 s windows) → 2–5 s latency | tiny 75 MB … large-v3 2.9 GB | MIT |
| faster-whisper (CTranslate2) | 99 | no (VAD + chunks) | int8 ≈ ½ | MIT |
| Silero VAD | — | VAD | 0.86 MB | MIT |
| Web Speech API | per vendor | yes | 0 | not OSS; Chrome sends audio to Google → not used by default |

**Conclusion:** for "on the fly" a streaming ASR is required — **sherpa-onnx** or **Vosk**.
Whisper — only as an "accurate" mode with 2–5 s latency (or on your own server).

### 4.2. MT (translation)

| Solution | Languages | Size | Quality | License |
|---|---|---|---|---|
| **Bergamot** (browsermt) | tiny ~86 X↔en pairs; base 11 pairs | 17–43 MB per direction | ru→en BLEU 30.4, en→ru 28.5/COMET 0.848 | MPL-2.0 |
| **M2M100-418M** | 100 | 1.94 GB → ≈0.5 GB int8 | acceptable | **MIT** |
| NLLB-200 distilled 600M | 202 | 2.46 GB → ≈0.6 GB int8 | better on rare languages | **CC-BY-NC-4.0 (non-commercial!)** |
| Argos Translate | 50 (via en-pivot) | 70–196 MB/direction | medium | code MIT, models CC-BY-4.0 |
| opus-mt | 1000+ pairs | ≈80 MB int8 | weaker | CC-BY-4.0 |
| Local LLM (Qwen3-4B etc.) | 100+ | 2.5–3.5 GB | better on context | Apache-2.0 |

**Conclusion:** for the browser — **Bergamot WASM** (fast, small) for the
supported pairs; for the server/desktop — **M2M100 (MIT)** as the
"license-safe" default, **NLLB-600M** — only if the project
is non-commercial. This is an important constraint: NLLB cannot be used in a
commercial product.

### 4.3. TTS (option, not in the MVP)

- OS voices: Web Speech Synthesis (browser), AVSpeech/System.Speech,
  Android TTS — free, with no licensing landmines.
- Piper — GPL-3.0 (since 2025 `piper1-gpl`), Coqui XTTS — CPML
  (non-commercial). Not taking them into the MVP; the "voice the translation" option — via
  system TTS.

### 4.4. Commit strategy for "live" subtitles

VAD (Silero) → streaming ASR → **LocalAgreement-2** (we fix the prefix that
matched in the two latest hypotheses) → MT only over fixed
sentences (no more than ~1 time per 300–500 ms) → UI (grey "draft" /
final text). This gives 0.7–1.8 s of latency and removes translation "flicker".
Additionally: punctuation/capitalization by a model (sherpa-onnx punctuation),
Whisper hallucination filter (`no_speech_threshold`,
`condition_on_previous_text=false`).

---

## 5. Option A — "Everything in the browser" (PWA: M2 + WASM models)

**Idea:** a single static web application, zero installs and servers.
Media is encoded with WebCodecs and travels over the `go-p2p-netcat` data channel; translation —
WASM models (sherpa-onnx + Bergamot) right in the browser.

**Data flow:**

```
getUserMedia ─► WebCodecs VideoEncoder/AudioEncoder ─► packetizer
   ─► RTCDataChannel (native WebRTC listener from p2p-netcat-core)
   ─► jitter buffer ─► decoder ─► <video>/<canvas> + WebAudio

own microphone ─► VAD ─► sherpa-onnx WASM ─► Bergamot WASM ─► SUBTITLE frames
                                                                         │
receiver: SUBTITLE ─► sherpa-onnx WASM VITS (ru/en voice) ─► WebAudio:
          dubbing 100% + original 20–30% (ducking)
```

**Key constraints (verified):**
- data channel — **ordered + reliable**, flow-window 256 KiB → at RTT 300 ms
  the ceiling is ≈ 7 Mbit/s; at 3–5 % loss head-of-line blocking gives 0.5–2 s
  of latency. For 480p this is still ok, for 720p — borderline.
- WebCodecs: Chrome/Edge 94+, Firefox desktop 130+, **Firefox Android — no**,
  Safari — partially up to 26+. That is, the mobile browser often falls away.
- Must be written from scratch: packetizer, jitter buffer, A/V sync, bandwidth
  estimation (AIMD/GCC), keyframe request, loss handling. That is 1500–2500 lines
  of risky realtime code.
- **Dubbing:** TTS (`sherpa-onnx WASM VITS` + piper voices ru/en) synthesizes
  the translation on the receiver; the WebAudio graph ducks the original and mixes;
  fallback — Web Speech Synthesis. TTS latency 0.1–0.6 s.

**Pros:** nothing is installed; a link with a token → a call; speech does not
leave the device; maximum "pure P2P".

**Cons:** the most complex realtime code; bandwidth ceiling; WASM ASR on a phone
cannot keep up; Bergamot — a limited set of pairs; Safari/Firefox Android;
high risk that it "barely stays alive on real devices".

**Estimate:** ~80–90 small commits, half of them risky realtime
(media + TTS). Time-to-demo — longer than with B.

**Who it's for:** if "install nothing and no servers" is critical, and
"demo/pilot" quality on a limited set of languages is acceptable.

**Verdict:** **chosen by the client (2026-11-07)**. Requires discipline: spikes
P3A-01/P5A-01/P5T-01 before the main code and a fallback path via native media
(D16), if data-channel media cannot cope. Dubbing is fully local and does not
require servers.

---

## 6. Option B — "Thin client + own translator" ⭐ recommended

**Idea:** a PWA with **native WebRTC** for media (M1). `go-p2p-netcat` —
identity, token, discovery, authentication and the **control channel** (SDP/ICE,
subtitles, control). Translation — a pluggable backend: first a
**WASM fallback** (sherpa-onnx + Bergamot), for quality — a **self-hosted
`lingua-node`** (Whisper/M2M100, free, on a laptop/LAN/VPS).

**Architecture (sub-option B2 — two WebRTC connections):**

```
Browser A                                             Browser B
┌───────────────────────────────┐      ┌───────────────────────────────┐
│ UI (React)                    │      │ UI (React)                    │
│ identity in IndexedDB         │      │ identity in IndexedDB         │
│ transport-p2p:                │      │ transport-p2p:                │
│   listener / connect by token │◄────►│   connect by token            │
│   WebRtcStream (data channel) │ p2p  │   WebRtcStream (data channel) │
│   = CONTROL: HELLO, SDP, ICE, │      │                               │
│     SUBTITLE, CONTROL, BYE    │      │                               │
│ media-rtc: RTCPeerConnection  │◄════►│ media-rtc: RTCPeerConnection  │
│   addTrack(audio,video)       │ UDP  │   (media directly)            │
│ ASR+MT: WASM or lingua-node   │      │ ASR+MT                        │
└──────────────┬────────────────┘      └───────────────────────────────┘
               │ WebSocket (local/own server)
               ▼
        lingua-node (self-hosted, free)
        streaming sherpa-onnx / whisper.cpp + M2M100 + (opt. OS TTS)
```

**How it works (verified against the code):**
- **Control channel:** browser listener via `startNativeWebRtcListener`,
  client — `connectNativeWebRtc`; token — `createPairingToken`; for the listener
  a persistent Ed25519 identity (IndexedDB) is needed and `createAuthResponse =
  signWebRtcAuthResponseV2`; the server part of the token — `authenticateServerStream`.
  On top of the stream — our framed protocol (`HELLO`, `SDP`, `ICE`, `SUBTITLE`, …).
  **The Go part does not change** — it simply carries bytes.
- **Media:** a **second** `RTCPeerConnection` with `addTrack()`; SDP/ICE — as JSON frames
  over the control channel (we mark `media:1` in `HELLO`). Isolation: a failure of
  media ICE does not break the chat/subtitles. The browser itself does congestion control,
  NACK/FEC, jitter buffer, echo cancellation, Opus FEC.
- **Binding the two connections:** an app-level check that both peers are the same
  (SHA-256 hash of SDP in the control channel), since DTLS differs between the two PCs.
- **Subtitles:** each recognizes their own microphone (sherpa-onnx/Vosk streaming),
  translates into the interlocutor's language (Bergamot WASM / M2M100) and sends
  `SUBTITLE` over the control channel; the receiver displays. The interlocutor can see
  the original + the translation.
- **`lingua-node`** (quality option): WebSocket API `{audioChunk, srcLang,
  dstLang}` → `{partial, final, text}`; inside — streaming sherpa-onnx or
  whisper.cpp large-v3-turbo (on GPU/Apple Silicon) + M2M100 int8; launch —
  `docker compose up` or a single binary; health-check in the UI.
- **NAT:** public STUN by default; under symmetric NAT — **own coturn**
  (free) or fallback A (video over the control channel via relay/WSS).

**Pros:**
- The best balance: native media (quality, adaptation, echo) + proper
  ASR/MT models.
- One UI/protocol for web and desktop; a link with a token works on a phone.
- No paid services; the node is your own or even `localhost`.
- Gradual degradation: without a node — WASM; with a node — quality.
- Less risky realtime code; we do not touch Go.

**Cons:**
- Good quality requires your own `lingua-node` (Docker/binary) — an extra step
  for the user; in the first version the node is optional (WASM fallback).
- The tab must be open; mobile background kills the call (fixed by a Tauri/Capacitor
  shell later).
- Speech goes to the node if it is not on `localhost` — privacy must be honestly explained.
- coturn is needed for some NATs; there is no built-in TURN.
- No media compatibility with a Go peer (Go cannot do addTrack);
  media — only between "our" clients. Chat/subtitles with a Go peer — yes.

**Estimate:** ~60–75 small commits. By phases (per the research):
Phase 1 (identity in IndexedDB + token in the UI + listener + `authenticateServerStream`
+ second PC with media + signaling over the stream + call UI) — 8–10 commits;
Phase 2 (capability `media:1`, chat/subtitles in the same stream, reconnect) — 5–7;
Phase 3 (WASM ASR/MT, subtitle settings) — 8–10; Phase 4 (lingua-node,
coturn, fallback A) — 8–10. Time-to-demo — the shortest.

**Verdict:** I recommend it as the main one.

---

## 7. Option C — "Desktop, everything local" (Tauri + sidecars + local models)

**Idea:** a native desktop application (Tauri 2, the same React UI). Sidecar
`p2p-nc` (Go) as the transport; local models: streaming sherpa-onnx/Vosk +
whisper.cpp (Metal/CUDA) as accurate mode + M2M100/Bergamot. **Full offline**
after the first model download, no servers.

**Architecture:**

```
Tauri app
├─ React UI (apps/web)
├─ Rust core: IPC/events, sidecar management, mic/cam permissions
├─ sidecar p2p-nc (Go): listener/connect by token, control stream
├─ ASR sidecar: sherpa-onnx streaming (+ whisper.cpp for accurate mode)
├─ MT sidecar: M2M100 int8 / Bergamot; opt. TTS with OS voice
└─ media: RTCPeerConnection in webview + SDP/ICE over the p2p-nc control stream

A(desktop) ◄══ WebRTC media ══► B(desktop)
             control — via p2p-nc (SDP/ICE/subtitles)
```

- Token and listener — `p2p-nc` (Go): stable PeerId, private rendezvous,
  DHT/QUIC/relay; a browser client will also be able to connect (compatible).
- Media — webview (WKWebView/WebView2); on problems — later native
  webrtc-rs, but starting with webview is simpler.
- Models are downloaded on first launch (0.5–1.5 GB), verified by checksum,
  cached; int8/q5 to save space.
- UI — the same as in B; the only difference is the engine implementation and the shell.

**Pros:** the best quality and latency (streaming ASR + M2M100 on your own
hardware, Metal on M1); full offline; maximum privacy; p2p-nc
is used to the maximum; the same codebase → cheap migration from B.

**Cons:** desktop only; distribution size; packaging/signing/updates/
camera permissions in the webview; more platform code; cross-OS WebRTC
in the webview needs testing.

**Estimate:** ~75–90 small commits; a lot of platform/packaging work.
Time-to-demo — later than B, quality — higher.

**Who it's for:** if the priority is quality/offline/privacy and calls between
computers; installing an app is acceptable.

**Verdict:** the best "premium" option; a natural stage 2 after B (the same
UI, a shell and local engines are added).

---

## 8. Option D — "Android app" (Kotlin/Compose + local models)

**Idea:** a native mobile application — "like Zoom/WhatsApp, but P2P and with
live translation".

**Architecture:**
- UI: Kotlin + Jetpack Compose; 4 screens.
- Transport: **a bridge to `go-p2p-netcat` is needed**. Options: (a) gomobile binding of the
  Go library (no such API today — work in go-p2p-netcat),
  (b) a WebView with the PWA (Option B inside), (c) a Kotlin implementation of the protocol
  (very much). The recommended one — (a), but that is a separate preparatory
  project.
- Media: `org.webrtc:google-webrtc` + signaling over the control channel.
- ASR: `sherpa-onnx`/Vosk-Android (streaming) — realistic on a phone.
- MT: M2M100 int8 via ONNX Runtime Mobile (200–600 MB) — heavy; on weak
  devices — translation on your own node (B server).
- TTS: Android TextToSpeech (offline OS voices).

**Pros:** a real mobile experience, push notifications, battery; local
ASR models are realistic; maximum reach.

**Cons:** the largest scope of work (first a gomobile binding of the transport,
then the app, then models for ARM); heavy MT models on a phone;
Google Play; iOS — a separate world; today p2p-netcat Android is a shell binary
via adb, not a library.

**Estimate:** ~100+ small commits + work in the go-p2p-netcat repository. The longest
path to a demo.

**Verdict:** not the first option; a logical continuation of B/C after the MVP.

---

## 9. Comparison matrix

| Criterion | A. Everything in the browser | B. PWA + own node ⭐ | C. Desktop local | D. Android |
|---|---|---|---|---|
| Platforms | desktop browsers (mobile partially) | browsers (desktop+mobile) | macOS/Win/Linux | Android |
| Installation | no | no (node — optional) | yes (app+models) | yes (APK) |
| Full offline | ⚠️ after the model cache | ⚠️ with a local node | ✅ | ⚠️ |
| Media quality | medium (own stack) | **high** (native) | high | high |
| Translation quality | medium (WASM) | **high** (node) | **high** | medium |
| Subtitle latency | 1.5–4 s | 0.7–2 s | 0.7–1.5 s | 1–2.5 s |
| Voicing the translation (dubbing) | ✅ local (sherpa TTS + ducking) | ✅ (WASM/node) | ✅ | ✅ |
| External free services | signaling+STUN | signaling+STUN (replaceable) | almost none | signaling+STUN |
| Privacy | maximum | depends on the node | maximum | medium |
| Complexity | high (realtime) | **medium** | high (platforms) | very high |
| Distribution | ~50 MB | small client (node separately) | 0.5–1.5 GB | 200 MB–1 GB |
| Time-to-demo | medium-long | **short** | long | very long |
| "Won't take off" risk | high | **low** | medium | high |

---

## 10. Recommendation

**The recommendation was B**, but the client chose **A** (fully in the browser) and
confirmed that dubbing is the main feature. The plan has been rebuilt for A: TTS is local at the
receiver, D16 keeps a path to native media if the data channel cannot cope.
Below is the original rationale for B (decision history).

Why:

1. **Fastest to a working product.** The browser does media (native
   WebRTC), we do not write a complex realtime stack. `go-p2p-netcat` is used as
   intended: token, discovery, authentication, control channel (SDP/ICE,
   subtitles, control). The Go part does not change.
2. **Achievable translation quality.** `lingua-node` on your own hardware gives
   streaming ASR + M2M100 (MIT) for dozens of languages; the WASM fallback allows
   working with no infrastructure at all.
3. **Maximum reach:** a link with a token opens on a computer and a
   phone, installing nothing.
4. **No paid services:** the node is your own (localhost/LAN/VPS), the models are
   open-source (mandatory MIT/Apache/MPL/CC-BY, not NC); signaling/STUN can be
   self-hosted.
5. **Smooth evolution into C and D:** the UI, protocol, subtitle model and engine
   interfaces are reused; the Tauri desktop shell is added on top,
   Android — via WebView/gomobile later.

**If the priority is different:**
- "Full offline and no servers at all" → **Option C**.
- "Browser only and no servers" (ready for the limitations) → **Option A**.
- "A mobile app specifically" → **Option D**, understanding that
  go-p2p-netcat will first have to be extended (gomobile).

### Roadmap inside B (if we choose it)

1. **Demo #1 (without a node):** identity in IndexedDB, token generation in the UI,
   browser listener, second PC with media, signaling over the control stream,
   call UI; ru↔en subtitles on sherpa-onnx WASM + Bergamot WASM.
2. **Demo #2 (with a node):** `docker compose up lingua-node` → quality
   subtitles in 10+ languages, latency ≤ 2 s.
3. **Reliability:** coturn optionally, fallback A when media ICE fails,
   reconnect, diagnostics.
4. **Next:** a Tauri desktop shell with local engines (= Option C) without
   rewriting; Android — a separate track.

---

## 11. License constraints (important!)

The "no paid services" requirement is met, but model licenses impose
constraints on **commercial** use:

- ✅ allowed: whisper.cpp (MIT), sherpa-onnx (Apache-2.0), Vosk (Apache-2.0, but
  check the models), M2M100 (MIT), Bergamot (MPL-2.0), Argos (MIT code,
  CC-BY-4.0 models), Silero VAD (MIT), opus-mt (CC-BY-4.0).
- ⛔ **NLLB-200 — CC-BY-NC-4.0** (non-commercial). Cannot be used in a commercial
  product without a separate license.
- ⚠️ Silero STT/TTS — CC-BY-NC; Piper — GPL-3.0 (since 2025 `piper1-gpl`);
  LibreTranslate — AGPL-3.0; some Vosk models — AGPL/NC. Check every
  model; for the MVP we do not take TTS (system OS voices).

In `PLAN.md` this is a separate decision (D11) and a mandatory review item when
adding any model.

---

## 12. Questions for the client (the finalization of the plan depends on them)

1. **Which option do we choose?** (A / B / C / D)
2. Platform priority: **desktop / web / Android?**
3. Is **your own server component** acceptable (localhost/LAN/VPS — free,
   open-source) for quality translation, or is "no servers" strictly required?
4. Is **full offline** after installation needed?
5. Language pairs for the MVP: I propose **ru↔en + auto-detection**, then
   uk/de/es/fr/zh/ar/tr/hi.
6. Is **voicing the translation (TTS)** needed in the MVP, or are subtitles enough?
7. Is the project **commercial?** (affects model choice: NLLB cannot be used for
   commercial use).
8. Are there requirements for the **brand/name** (currently the working name is "LinguaCall")?
