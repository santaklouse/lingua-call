**English** | [Русский](README.RU.md)

# LinguaCall (working name)

P2P video communication with automatic translation of speech into subtitles —
without third-party paid services and without servers: everything runs in the
browser.

- **Transport:** [`go-p2p-netcat`](https://github.com/santaklouse/go-p2p-netcat)
  (libp2p + native WebRTC, `pnc1_` pairing tokens).
- **Media:** WebCodecs (VP8/VP9/H.264 + Opus) over an authenticated
  data channel.
- **Speech:** WASM models in the browser (streaming ASR sherpa-onnx/Vosk + MT
  Bergamot), private and free.
- **Dubbing:** the user hears translated speech (sherpa-onnx WASM VITS,
  piper voices ru/en; fallback — OS voices), the original is muted via
  WebAudio. This is the main feature, not just subtitles.
- **Chosen variant:** A — "everything in the browser" (decision 2026-11-07).

## Documents

| File | Purpose |
|---|---|
| [`PLAN.md`](PLAN.md) | Living plan: decisions, backlog, state, journal. **Source of truth.** |
| [`docs/PROPOSALS.md`](docs/PROPOSALS.md) | Architecture variants (A/B/C/D), comparison matrix, decision. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture of the chosen variant (layers, protocol, media pipeline). |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | Facts about `go-p2p-netcat`, free ASR/MT/TTS and licenses. |

## Quick start

Requirements: **Bun ≥ 1.2** (runtime, package manager and test runner).
Go ≥ 1.25 — optional (for building `p2p-nc` and compatibility tests).

```bash
bun scripts/check-prereq.mjs
bun install
bun run dev       # UI at http://localhost:5173
bun run typecheck
bun run lint
bun test
bun run build
```

## Test on real devices (HTTPS required)

Browsers expose the camera, microphone and Web Speech APIs only in a **secure
context**. `http://localhost` works, but phones/other machines cannot use media
over plain HTTP. Use the bundled Docker + Cloudflare Tunnel setup:

```bash
cp .env.example .env            # paste your CLOUDFLARE_TUNNEL_TOKEN
docker compose --profile tunnel up -d --build
# then open https://linguacall.<your-domain>/
```

Full step-by-step dashboard instructions (create tunnel, public hostname
`web:80`, Zero Trust Access) are in [`docs/TUNNEL.md`](docs/TUNNEL.md).
Local preview without a tunnel: `docker compose up -d --build web` →
`http://localhost:8080`.

## Status

P0 bootstrap is complete (12/12 tasks) and the toolchain is Bun. The UI shell now
has language selection, lobby with create/join flows (mock invite tokens) and a
temporary manual-WebRTC call screen (copyable SDP codes) for audio/video.
**Current focus (D19): the translation + dubbing pipeline** — mic → VAD → ASR →
MT → subtitles + spoken translation, with per-stage latency metrics. The
`go-p2p-netcat` transport and local WASM engines are deferred (see `PLAN.md`).

## License

MIT. Models and engines — only with acceptable licenses (see `PLAN.md` D11).
