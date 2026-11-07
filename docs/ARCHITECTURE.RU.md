[English](ARCHITECTURE.md) | **Русский**

> **Текущий статус (2026-11-07):** план изменился (D19/D20). Временный транспорт —
> ручной WebRTC (SDP-коды копированием, без серверов); интеграция
> `go-p2p-netcat` отложена до P2N. Текущий фокус — пайплайн перевода и озвучки
> (P5P): микрофон → VAD → ASR → MT → субтитры + озвученный перевод. Разделы ниже
> описывают целевую архитектуру, а не текущий прототип.

# Архитектура LinguaCall (вариант A — всё в браузере)

Статус: каркас, наполняется по мере реализации. Связанные документы:
[`PLAN.md`](../PLAN.md), [`PROPOSALS.RU.md`](PROPOSALS.RU.md), [`RESEARCH.RU.md`](RESEARCH.RU.md).

## 1. Цели

P2P-видеосвязь в браузере с автоматическим переводом речи в субтитры.
Ограничения: без платных сервисов, без серверов (вариант A), транспорт —
[`go-p2p-netcat`](https://github.com/santaklouse/go-p2p-netcat).

## 2. Слои

```
apps/web                 React+TS UI: экраны, субтитры, настройки, i18n
packages/session-core    state machine звонка, модель субтитров, настройки
packages/transport-p2p   identity (IndexedDB), pairing-токены, listener/connect
packages/media-dc        WebCodecs: захват, кодеки, пакетизатор, джиттер, A/V
packages/asr             интерфейс + sherpa-onnx/Vosk WASM адаптер
packages/mt              интерфейс + Bergamot WASM / Chrome API адаптер
packages/tts             интерфейс (MVP — заглушка / голоса ОС)
packages/protocol        framed wire-протокол, CBOR-схемы, версии
packages/i18n            строки UI ru/en
```

## 3. Транспорт и pairing

- `go-p2p-netcat` даёт байтовый поток (`WebRtcStream` — ordered reliable data
  channel), адресуемый pairing-токеном `pnc1_`.
- Create: Ed25519 identity в IndexedDB → `startNativeWebRtcListener` с
  `createAuthResponse` → `createPairingToken({ peerId, service, secret, expiresAt })`
  → токен + ссылка `#token=`.
- Join: `decodePairingToken` → `assertPairingTokenUsable` → приватный
  rendezvous (`deriveRendezvousId`) → `connectNativeWebRtc` → mutual admission
  (`authenticateClientStream`/`authenticateServerStream`) → `WebRtcStream`.
- Токен — bearer: только в `#fragment`, не в localStorage.

## 4. Wire-протокол (поверх `WebRtcStream`)

Кадр: `type:u8 | flags:u8 | len:u32(BE) | payload`.

| Диапазон | Назначение |
|---|---|
| 0x01–0x02 | `HELLO` / `HELLO_ACK` (версия, языки, возможности) |
| 0x10–0x12 | `CONTROL`, `SUBTITLE`, `STATS` (CBOR) |
| 0x20 | `KEYFRAME_REQUEST` |
| 0x30–0x31 | `VIDEO_FRAME`, `AUDIO_FRAME` (бинарный контейнер) |
| 0x40–0x41 | `PING` / `PONG` |
| 0x7f | `BYE` |

Приоритет записи в поток: control/subtitles → keyframe request → audio →
video. Детали — в PLAN §3.2 и `docs/PROTOCOL.md` (появится в P2-10).

## 5. Медиа-конвейер (WebCodecs)

```
getUserMedia
 ├─ видео: MediaStreamTrackProcessor | <video>+requestVideoFrameCallback
 │         → VideoFrame → VideoEncoder (VP8/VP9/H.264) → фрагменты ≤16 КиБ
 └─ аудио: AudioWorklet (48 кГц/20 мс) → AudioEncoder (Opus) → фрагменты
        ↓
приоритетная очередь / пейсер → WebRtcStream → сеть → WebRtcStream
        ↓
демультиплексор → джиттер-буфер → VideoDecoder/AudioDecoder
        → canvas/<video> + WebAudio, A/V-синхронизация по timestamps
```

Основные риски: ограничение полосы ordered reliable data channel (окно 256 КиБ,
≈7 Мбит/с при RTT 300 мс), head-of-line при потерях, поддержка WebCodecs по
браузерам. Митигации: малые фрагменты, XOR-FEC, запросы keyframe, адаптивный
bitrate, аудио-only fallback.

## 6. Субтитры

Каждый участник распознаёт **свой** микрофон (свой язык известен),
переводит на язык собеседника и отправляет `SUBTITLE` по тому же потоку.
Приёмник только отображает. Пайплайн:
VAD (Silero) → streaming-ASR (sherpa-onnx/Vosk WASM) → LocalAgreement-2 →
MT (Bergamot WASM) → `SUBTITLE` → UI. Детали — PLAN §3.5.

## 7. Диагностика

Локальные метрики: fps, bitrate, queue, dropped frames, RTT/jitter,
ASR/MT latency (p50/p90), состояние соединения. Никакой внешней телеметрии.
