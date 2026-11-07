**English** | [Русский](ARCHITECTURE.RU.md)

> **Current status (2026-11-07):** the plan changed (D19/D20). The temporary
> transport is manual WebRTC (copyable SDP codes, no servers); `go-p2p-netcat`
> integration is deferred to P2N. The current focus is the translation + dubbing
> pipeline (P5P): mic → VAD → ASR → MT → subtitles + spoken translation. Sections
> below describe the target architecture, not the current prototype.

# LinguaCall Architecture (Option A — everything in the browser)

Status: skeleton, filled in as implementation progresses. Related documents:
[`PLAN.md`](../PLAN.md), [`PROPOSALS.md`](PROPOSALS.md), [`RESEARCH.md`](RESEARCH.md).

## 1. Goals

P2P video communication in the browser with automatic speech-to-subtitle
translation. Constraints: no paid services, no servers (Option A), transport —
[`go-p2p-netcat`](https://github.com/santaklouse/go-p2p-netcat).

## 2. Layers

```
apps/web                 React+TS UI: screens, subtitles, settings, i18n
packages/session-core    call state machine, subtitle model, settings
packages/transport-p2p   identity (IndexedDB), pairing tokens, listener/connect
packages/media-dc        WebCodecs: capture, codecs, packetizer, jitter, A/V
packages/asr             interface + sherpa-onnx/Vosk WASM adapter
packages/mt              interface + Bergamot WASM / Chrome API adapter
packages/tts             interface (MVP — stub / OS voices)
packages/protocol        framed wire protocol, CBOR schemas, versions
packages/i18n            UI strings ru/en
```

## 3. Transport and pairing

- `go-p2p-netcat` provides a byte stream (`WebRtcStream` — ordered reliable data
  channel), addressed by the pairing token `pnc1_`.
- Create: Ed25519 identity in IndexedDB → `startNativeWebRtcListener` with
  `createAuthResponse` → `createPairingToken({ peerId, service, secret, expiresAt })`
  → token + link `#token=`.
- Join: `decodePairingToken` → `assertPairingTokenUsable` → private
  rendezvous (`deriveRendezvousId`) → `connectNativeWebRtc` → mutual admission
  (`authenticateClientStream`/`authenticateServerStream`) → `WebRtcStream`.
- The token is a bearer secret: only in the `#fragment`, not in localStorage.

## 4. Wire protocol (over `WebRtcStream`)

Frame: `type:u8 | flags:u8 | len:u32(BE) | payload`.

| Range | Purpose |
|---|---|
| 0x01–0x02 | `HELLO` / `HELLO_ACK` (version, languages, capabilities) |
| 0x10–0x12 | `CONTROL`, `SUBTITLE`, `STATS` (CBOR) |
| 0x20 | `KEYFRAME_REQUEST` |
| 0x30–0x31 | `VIDEO_FRAME`, `AUDIO_FRAME` (binary container) |
| 0x40–0x41 | `PING` / `PONG` |
| 0x7f | `BYE` |

Write priority to the stream: control/subtitles → keyframe request → audio →
video. Details in PLAN §3.2 and `docs/PROTOCOL.md` (to appear in P2-10).

## 5. Media pipeline (WebCodecs)

```
getUserMedia
 ├─ video: MediaStreamTrackProcessor | <video>+requestVideoFrameCallback
 │         → VideoFrame → VideoEncoder (VP8/VP9/H.264) → fragments ≤16 KiB
 └─ audio: AudioWorklet (48 kHz/20 ms) → AudioEncoder (Opus) → fragments
        ↓
priority queue / pacer → WebRtcStream → network → WebRtcStream
        ↓
demultiplexer → jitter buffer → VideoDecoder/AudioDecoder
        → canvas/<video> + WebAudio, A/V sync by timestamps
```

Main risks: bandwidth limit of the ordered reliable data channel (256 KiB window,
≈7 Mbit/s at RTT 300 ms), head-of-line blocking on loss, WebCodecs browser
support. Mitigations: small fragments, XOR-FEC, keyframe requests, adaptive
bitrate, audio-only fallback.

## 6. Subtitles

Each participant recognizes **their own** microphone (their language is known),
translates into the interlocutor's language and sends `SUBTITLE` over the same
stream. The receiver only displays. Pipeline:
VAD (Silero) → streaming ASR (sherpa-onnx/Vosk WASM) → LocalAgreement-2 →
MT (Bergamot WASM) → `SUBTITLE` → UI. Details in PLAN §3.5.

## 7. Diagnostics

Local metrics: fps, bitrate, queue, dropped frames, RTT/jitter,
ASR/MT latency (p50/p90), connection state. No external telemetry.
