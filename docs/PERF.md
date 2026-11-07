# Latency: measurement and tuning

**English** | [Русский](PERF.RU.md)

The main feature must feel live (PLAN.md D23). This page explains how to measure
the pipeline and what to tune.

## Targets (D23)

| Stage | Target (p50) | Target (p90) |
|---|---|---|
| ASR final after phrase end | ≤ 700 ms | ≤ 1200 ms |
| MT (final segment) | ≤ 150 ms | ≤ 300 ms |
| TTS start | ≤ 300 ms | ≤ 600 ms |
| **End-to-end (phrase end → dubbed voice)** | **≤ 1.5 s** | **≤ 2.5 s** |

## How to measure the live demo

1. Open `bun run dev` (or the HTTPS deployment) in Chrome/Edge and go to
   lobby → **Live translation demo**.
2. Use the same short phrase 10+ times (for example “Привет, как дела?”), then a
   few longer sentences.
3. The **Latency (ms)** table shows `last / p50 / p90 / samples` for
   `ASR`, `MT`, `TTS playback`, `End-to-end`.
4. Press **Copy metrics** — it copies JSON with the language pair, browser, and
   the latency summary. Attach it to the issue/chat.
5. Repeat with the translation prefetch warm (second phrase onward) and note the
   first-phrase numbers separately (model/voice warm-up).

In a call, the **Debug console** widget logs connection states, subtitle
send/receive events and dubbing start/finish; use **Copy** for a full call log.

## What affects latency / what to tune

| Knob | Where | Effect |
|---|---|---|
| Engine warmup (translator/voices) | `TranslationPipeline.start()` | removes first-phrase model load |
| Stable-partial prefetch (450 ms) | `pipeline.ts` (`PREFETCH_STABILITY_MS`) | hides MT latency behind ASR finalization |
| TTS rate (1.05 default) | `web-speech-tts.ts` | slightly faster speech, less queue backlog |
| Single-slot speech queue | `pipeline.ts` / call screen | drops stale phrases instead of falling behind |
| Sentence length | ASR/MT segmentation | shorter phrases start sooner but translate less accurately |
| Browser/network | Web Speech may use vendor cloud | local WASM engines are the long-term fix (P5A/P5T) |

## Recording results

Add a row per run:

| Date | Device/Browser | Pair | ASR p90 | MT p90 | TTS p90 | E2E p90 | Notes |
|---|---|---|---|---|---|---|---|
| — | — | ru→en | — | — | — | — | fill from “Copy metrics” |
