**English** | [Русский](RESEARCH.RU.md)

# Research: transport, media, and a free ASR/MT stack

Date: 2026-11-07. Source — the `go-p2p-netcat` code and official repositories/docs.
An "≈" mark means an estimate, not a primary source. This document exists so that
everything does not need to be re-verified when work resumes.

---

## 1. `go-p2p-netcat`: what exists and what does not (per the code)

Repository: `https://github.com/santaklouse/go-p2p-netcat`, locally
`/Users/alexnevpryaga/projects/santaklouse/go-p2p-netcat`.

### 1.1. Transport

- Two independent byte paths:
  1. libp2p stream `/p2p-netcat/1.0.0/<logical-port>` over TCP, QUIC v1, WS/WSS,
     WebTransport, WebRTC Direct, Circuit Relay v2;
  2. native WebRTC ordered reliable `RTCDataChannel` `p2p-netcat-v2` via
     Nostr kind-25050 + WebTorrent signaling.
- Native data channel wire: `[0x02][type][payload]`, types 0=data, 1=control,
  2..4=auth (`packages/core/src/native-webrtc.js`).
- Flow window 256 KiB, read queue 1 MiB → goodput ≈ window/RTT (≈7 Mbit/s at
  RTT 300 ms). For video that is not enough; for subtitles/control — with margin.
- Signaling carries only SDP/ICE/bye; application bytes do not go through trackers.

### 1.2. Media

- `grep addTrack|ontrack|getUserMedia|getDisplayMedia|addTransceiver|MediaStream`
  over the repository = **0 matches**. SDP is created without `m=audio/video`.
- In Go/Pion (`nativewebrtc/*.go`) there is no `AddTrack`/`OnTrack`/RTP.
- **Conclusion:** video/audio must be delivered separately:
  - (M1) a second `RTCPeerConnection` with `addTrack`, SDP/ICE over the control stream;
  - (M2) WebCodecs + a custom packetizer over the data channel.

### 1.3. Browser listener

- `startNativeWebRtcListener()` exists and is browser-safe (`packages/core/src/native-endpoint.js`),
  but is not used in the current PWA (the PWA only does `connect`).
- Limitations: it answers offers only (glare is impossible); required are
  (a) a persistent Ed25519 identity (currently `createLibp2p` without a key → the key is
  ephemeral), (b) `createAuthResponse = signWebRtcAuthResponseV2` with a key
  whose PeerId = `token.PeerId`, (c) server-side authentication
  `authenticateServerStream` (not used in web), (d) a shared signaling-peerId
  for sessions.
- `RTCPeerConnection` is available only in Window → the listener runs on the main thread,
  the tab must be open, mobile background kills the connection.
- Browser→Go already works: Go starts a native listener when a token is present.

### 1.4. `pnc1_` tokens

- Format: `pnc1_` + base64url(canonical CBOR): version=1, PeerId, port,
  32-byte secret, relayHints, expiresAt.
- `createPairingToken()` is available in the browser; the secret — `crypto.getRandomValues`;
  the PeerId — via `peerIdFromString`. **A token can be created in the browser.**
- The token is a bearer secret: in the URL only in the `#fragment`, not in localStorage.
- `pnc1e_` (encrypted envelope) exists only in Go, not in the browser.

### 1.5. NAT / STUN / TURN

- 9 public STUN servers by default, **TURN is absent**.
- Symmetric NAT / blocked UDP → failure without coturn.
- Circuit Relay v2 (`p2p-nc relay`) carries only libp2p streams, **not SRTP**.
- Free options: public STUN (no SLA), self-hosted coturn (VPS/ports needed) — only
  these save native media under a hard NAT.

---

## 2. ASR (speech → text), free/OSS

| Engine | Languages | Streaming | Size | Speed | License |
|---|---|---|---|---|---|
| **sherpa-onnx** (next-gen Kaldi) | streaming: en, zh, ko, fr, de, es, ru (T-one 2025-09) | **true streaming + endpointing** | ~70 MB (int8) | RTF 0.04–0.1 on 1 thread | Apache-2.0 |
| **Vosk** 0.3.45 (Kaldi) | ~25 languages | **true streaming (partial)** | 31–50 MB small / 0.3–2.3 GB big | real time on 1 core | Apache-2.0 (some models NC/AGPL) |
| **whisper.cpp** | 99 | no: VAD + sliding window → 2–5 s | tiny 75 MB … large-v3 2.9 GB | small ≈0.16 RTF i7; turbo on M1 ≈0.2–0.4 RTF | MIT |
| faster-whisper (CTranslate2) | 99 | no: VAD + chunks | int8 ≈½ | small int8 RTF ≈0.13 CPU | MIT |
| Silero VAD | — | VAD | 0.86 MB | realtime | MIT |
| Silero STT | ru/en/es/de/ua | no | ~50 MB | fast | CC-BY-NC (non-commercial) |
| Web Speech API | per vendor | yes (cloud) | 0 | — | not OSS; Chrome → Google |

**Conclusion:** for "on the fly" — only streaming ASR (sherpa-onnx/Vosk). Whisper —
"accurate" mode. On Apple Silicon whisper.cpp uses Metal; faster-whisper
does not.

---

## 3. MT (translation), free/OSS

| Solution | Languages | Size | Quality (reference) | License |
|---|---|---|---|---|
| **Bergamot** (browsermt) | tiny ~86 X↔en pairs; base 11 pairs | 17–43 MB/direction | ru→en BLEU 30.4, en→ru 28.5 (COMET 0.848) | MPL-2.0 |
| **M2M100-418M** | 100 | 1.94 GB → ≈0.5 GB int8 | acceptable | **MIT** |
| NLLB-200 distilled 600M | 202 | 2.46 GB → ≈0.6 GB int8 | better on rare languages | **CC-BY-NC-4.0** |
| Argos Translate | 50 (via en-pivot) | 70–196 MB/direction | medium | code MIT / models CC-BY-4.0 |
| opus-mt (Helsinki-NLP) | 1000+ pairs | ≈80 MB int8 | weaker | CC-BY-4.0 |
| Local LLM (Qwen3-4B and others) | 100+ | 2.5–3.5 GB | better on context | Apache-2.0 |

**Default choice:** M2M100 (MIT) — safe for any project;
Bergamot — for the browser/small pairs; NLLB — non-commercial project only.

---

## 4. TTS (voicing the translation — a mandatory MVP feature)

| Solution | Languages | Size | License | Where to run |
|---|---|---|---|---|
| **sherpa-onnx TTS + VITS/piper models** | ru, en and dozens of others (piper voices) | ru/en voice ~60–120 MB | runtime Apache-2.0; **piper-voices — MIT** (check the voice) | browser WASM, native, Android |
| Piper standalone (`piper1-gpl`) | ru/en/… | ~20–120 MB/voice | **GPL-3.0** (code); voices — MIT | native |
| Silero TTS | ru, en, es, de, ua | ~50–100 MB | **CC-BY-NC** (the project is non-commercial — fine) | native/WASM (ONNX) |
| Kokoro-82M | en, zh (+some) | ~80–160 MB | Apache-2.0 | browser (ONNX/WebGPU) |
| Web Speech Synthesis | OS voices | 0 | not OSS, free | browser |
| eSpeak NG | many | ~10 MB | GPL-3.0 | WASM/native |

**Conclusion for Option A:** take **sherpa-onnx WASM + VITS/piper voices ru/en**
(the runtime is already needed for ASR; Apache-2.0; MIT voices; WASM examples exist in
sherpa-onnx `wasm/tts`). Fallback — **Web Speech Synthesis** (OS voices) if the
WASM voice failed to load/is unsupported. We do not pull in the GPL code of Piper standalone;
Silero — an option for non-commercial use.

**Dubbing (D17):**
- TTS runs on the **receiver** over final translation segments (partials
  are not voiced); the queue is sequential, short segments are joined.
- Playback via WebAudio (`AudioBufferSourceNode`) → `GainNode`; the original
  voice of the interlocutor is ducked during playback.
- Echo: `echoCancellation: true` on the microphone; without headphones —
  ducking and a limit on simultaneous playback.
- TTS latency: VITS WASM ≈ 0.1–0.6 s per phrase (estimate; to be verified in P5T-01).
- Links: [sherpa-onnx TTS](https://k2-fsa.github.io/sherpa/onnx/tts/index.html) ·
[WASM TTS assets](https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm/tts) ·
[piper-voices (MIT)](https://huggingface.co/rhasspy/piper-voices) ·
[Silero TTS](https://github.com/snakers4/silero-models) ·
[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) ·
[piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)

## 5. The "live" subtitles pipeline

```
own microphone ─► Silero VAD ─► streaming ASR (partial)
   ─► LocalAgreement-2 (commit the prefix that matched in 2 hypotheses)
   ─► MT over committed phrases (no more than once per 300–500 ms)
   ─► UI: grey "draft" + final text
```

- LocalAgreement-2 — from `ufal/whisper_streaming`; removes "flicker".
- Punctuation/capitalization — the sherpa-onnx punctuation model.
- Whisper hallucinations — VAD, `no_speech_threshold`,
  `condition_on_previous_text=false`, discarding repetitions.
- Echo during TTS — AEC or headphones only.

**Expected latency:** 0.7–1.8 s (local/node), 1–2.5 s (server with
whisper large-v3-turbo).

---

## 6. Browser support (WebCodecs, for Option A)

- Chrome/Edge 94+, Firefox desktop 130+, **Firefox Android — no**,
  Safari 16.4–18.7 partial, full — 26+.
- `RTCPeerConnection` — everywhere; `AudioEncoder` — not everywhere.
- Conclusion: media-over-datachannel is not suitable as the only path for mobile.

---

## 7. Links

**Transport:**
[go-p2p-netcat](https://github.com/santaklouse/go-p2p-netcat) ·
[ARCHITECTURE](https://github.com/santaklouse/go-p2p-netcat/blob/main/docs/ARCHITECTURE.md) ·
[PAIRING_PROTOCOL](https://github.com/santaklouse/go-p2p-netcat/blob/main/docs/PAIRING_PROTOCOL.md) ·
[WEBRTC_MIGRATION](https://github.com/santaklouse/go-p2p-netcat/blob/main/docs/WEBRTC_MIGRATION.md)

**ASR:**
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) ·
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) ·
[CTranslate2](https://github.com/OpenNMT/CTranslate2) ·
[Vosk](https://github.com/alphacep/vosk-api) ·
[Vosk models](https://alphacephei.com/vosk/models) ·
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) ·
[streaming docs](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/) ·
[Silero VAD](https://github.com/snakers4/silero-vad)

**MT:**
[Bergamot](https://github.com/browsermt/bergamot-translator) ·
[Firefox Translations models](https://github.com/mozilla/firefox-translations-models) ·
[NLLB](https://github.com/facebookresearch/fairseq/tree/nllb) ·
[M2M100](https://github.com/facebookresearch/fairseq/tree/main/examples/m2m_100) ·
[Argos Translate](https://github.com/argosopentech/argos-translate) ·
[LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) ·
[opus-mt](https://huggingface.co/Helsinki-NLP)

**Pipeline/projects:**
[whisper_streaming](https://github.com/ufal/whisper_streaming) ·
[SimulStreaming](https://github.com/ufal/SimulStreaming) ·
[RealtimeSTT](https://github.com/KoljaB/RealtimeSTT) ·
[WhisperLive](https://github.com/collabora/WhisperLive) ·
[LiveKit agents](https://github.com/livekit/agents) ·
[Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api)

**TTS:**
[Piper (GPL)](https://github.com/OHF-Voice/piper1-gpl) ·
[Coqui TTS](https://github.com/coqui-ai/TTS)
