# Исследование: транспорт, медиа и бесплатный стек ASR/MT

Дата: 2026-11-07. Источник — код `go-p2p-netcat` и официальные репозитории/доки.
Пометка «≈» — оценка, не первоисточник. Документ нужен, чтобы не перепроверять
всё заново при возобновлении работ.

---

## 1. `go-p2p-netcat`: что есть и чего нет (по коду)

Репозиторий: `https://github.com/santaklouse/go-p2p-netcat`, локально
`/Users/alexnevpryaga/projects/santaklouse/go-p2p-netcat`.

### 1.1. Транспорт

- Два независимых байтовых пути:
  1. libp2p-стрим `/p2p-netcat/1.0.0/<logical-port>` по TCP, QUIC v1, WS/WSS,
     WebTransport, WebRTC Direct, Circuit Relay v2;
  2. native WebRTC ordered reliable `RTCDataChannel` `p2p-netcat-v2` через
     Nostr kind-25050 + WebTorrent signaling.
- Wire native data channel: `[0x02][type][payload]`, types 0=data, 1=control,
  2..4=auth (`packages/core/src/native-webrtc.js`).
- Flow window 256 КиБ, read queue 1 МиБ → goodput ≈ окно/RTT (≈7 Мбит/с при
  RTT 300 мс). Для видео этого мало; для субтитров/control — с запасом.
- Signaling несёт только SDP/ICE/bye; байты приложения через трекеры не идут.

### 1.2. Медиа

- `grep addTrack|ontrack|getUserMedia|getDisplayMedia|addTransceiver|MediaStream`
  по репозиторию = **0 совпадений**. SDP создаётся без `m=audio/video`.
- В Go/Pion (`nativewebrtc/*.go`) нет `AddTrack`/`OnTrack`/RTP.
- **Вывод:** видео/аудио нужно доставлять отдельно:
  - (M1) второе `RTCPeerConnection` с `addTrack`, SDP/ICE — по control-потоку;
  - (M2) WebCodecs + собственный пакетизатор по data channel.

### 1.3. Браузерный listener

- `startNativeWebRtcListener()` есть и browser-safe (`packages/core/src/native-endpoint.js`),
  но в текущем PWA не используется (PWA только `connect`).
- Ограничения: отвечает только на offer (glare невозможен); нужны
  (а) персистентная Ed25519 identity (сейчас `createLibp2p` без ключа → ключ
  эфемерный), (б) `createAuthResponse = signWebRtcAuthResponseV2` с ключом,
  чей PeerId = `token.PeerId`, (в) серверная аутентификация
  `authenticateServerStream` (в web не используется), (г) общий signaling-peerId
  для сессий.
- `RTCPeerConnection` доступен только в Window → listener на главном потоке,
  вкладка должна быть открыта, мобильный фон убивает соединение.
- Browser→Go уже работает: Go поднимает native-listener при наличии токена.

### 1.4. Токены `pnc1_`

- Формат: `pnc1_` + base64url(canonical CBOR): version=1, PeerId, port,
  32-байтный secret, relayHints, expiresAt.
- `createPairingToken()` доступен в браузере; secret — `crypto.getRandomValues`;
  PeerId — через `peerIdFromString`. **Создать токен в браузере можно.**
- Токен — bearer: в URL только `#fragment`, не в localStorage.
- `pnc1e_` (шифрованный конверт) есть только в Go, в браузере нет.

### 1.5. NAT / STUN / TURN

- 9 публичных STUN по умолчанию, **TURN отсутствует**.
- Symmetric NAT / заблокированный UDP → провал без coturn.
- Circuit Relay v2 (`p2p-nc relay`) несёт только libp2p-стримы, **не SRTP**.
- Бесплатные варианты: публичные STUN (без SLA), self-hosted coturn (нужен
  VPS/порты) — только они спасают нативное медиа в жёстком NAT.

---

## 2. ASR (речь → текст), бесплатно/OSS

| Движок | Языки | Стриминг | Размер | Скорость | Лицензия |
|---|---|---|---|---|---|
| **sherpa-onnx** (next-gen Kaldi) | стриминг: en, zh, ko, fr, de, es, ru (T-one 2025-09) | **настоящий streaming + endpointing** | ~70 МБ (int8) | RTF 0.04–0.1 на 1 потоке | Apache-2.0 |
| **Vosk** 0.3.45 (Kaldi) | ~25 языков | **настоящий streaming (partial)** | 31–50 МБ small / 0.3–2.3 ГБ big | реальное время на 1 ядре | Apache-2.0 (часть моделей NC/AGPL) |
| **whisper.cpp** | 99 | нет: VAD + скользящее окно → 2–5 с | tiny 75 МБ … large-v3 2.9 ГБ | small ≈0.16 RTF i7; turbo на M1 ≈0.2–0.4 RTF | MIT |
| faster-whisper (CTranslate2) | 99 | нет: VAD + чанки | int8 ≈½ | small int8 RTF ≈0.13 CPU | MIT |
| Silero VAD | — | VAD | 0.86 МБ | realtime | MIT |
| Silero STT | ru/en/es/de/ua | нет | ~50 МБ | быстро | CC-BY-NC (некоммерч.) |
| Web Speech API | по вендору | да (облако) | 0 | — | не OSS; Chrome → Google |

**Вывод:** для «на лету» — только streaming-ASR (sherpa-onnx/Vosk). Whisper —
«точный» режим. На Apple Silicon whisper.cpp использует Metal; faster-whisper
без Metal.

---

## 3. MT (перевод), бесплатно/OSS

| Решение | Языки | Размер | Качество (ориентир) | Лицензия |
|---|---|---|---|---|
| **Bergamot** (browsermt) | tiny ~86 пар X↔en; base 11 пар | 17–43 МБ/направление | ru→en BLEU 30.4, en→ru 28.5 (COMET 0.848) | MPL-2.0 |
| **M2M100-418M** | 100 | 1.94 ГБ → ≈0.5 ГБ int8 | приемлемо | **MIT** |
| NLLB-200 distilled 600M | 202 | 2.46 ГБ → ≈0.6 ГБ int8 | лучше на редких языках | **CC-BY-NC-4.0** |
| Argos Translate | 50 (через en-pivot) | 70–196 МБ/направление | средне | код MIT / модели CC-BY-4.0 |
| opus-mt (Helsinki-NLP) | 1000+ пар | ≈80 МБ int8 | слабее | CC-BY-4.0 |
| Локальная LLM (Qwen3-4B и др.) | 100+ | 2.5–3.5 ГБ | лучше по контексту | Apache-2.0 |

**Выбор по умолчанию:** M2M100 (MIT) — безопасно для любого проекта;
Bergamot — для браузера/маленьких пар; NLLB — только некоммерческий проект.

---

## 4. TTS (опция)

- Системные голоса: Web Speech Synthesis, Android TTS, AVSpeech — бесплатно,
  без лицензионных мин.
- Piper — **GPL-3.0** (с 2025 `piper1-gpl`), Coqui XTTS — CPML (NC). В MVP не
  берём.

---

## 5. Пайплайн «живых» субтитров

```
свой микрофон ─► Silero VAD ─► streaming-ASR (partial)
   ─► LocalAgreement-2 (commit префикса, совпавшего в 2 гипотезах)
   ─► MT по закоммиченным фразам (не чаще 1 раза в 300–500 мс)
   ─► UI: серый «черновик» + финальный текст
```

- LocalAgreement-2 — из `ufal/whisper_streaming`; убирает «мигание».
- Пунктуация/капитализация — модель sherpa-onnx punctuation.
- Галлюцинации Whisper — VAD, `no_speech_threshold`,
  `condition_on_previous_text=false`, отбрасывание повторов.
- Эхо при TTS — AEC или только в наушниках.

**Ожидаемая задержка:** 0.7–1.8 с (локально/узел), 1–2.5 с (сервер с
whisper large-v3-turbo).

---

## 6. Поддержка браузеров (WebCodecs, для варианта A)

- Chrome/Edge 94+, Firefox desktop 130+, **Firefox Android — нет**,
  Safari 16.4–18.7 partial, full — 26+.
- `RTCPeerConnection` — везде; `AudioEncoder` — не везде.
- Вывод: media-over-datachannel не годится как единственный путь для мобильных.

---

## 7. Ссылки

**Транспорт:**
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

**Пайплайн/проекты:**
[whisper_streaming](https://github.com/ufal/whisper_streaming) ·
[SimulStreaming](https://github.com/ufal/SimulStreaming) ·
[RealtimeSTT](https://github.com/KoljaB/RealtimeSTT) ·
[WhisperLive](https://github.com/collabora/WhisperLive) ·
[LiveKit agents](https://github.com/livekit/agents) ·
[Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api)

**TTS:**
[Piper (GPL)](https://github.com/OHF-Voice/piper1-gpl) ·
[Coqui TTS](https://github.com/coqui-ai/TTS)
