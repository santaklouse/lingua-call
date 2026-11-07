# LinguaCall (рабочее имя)

P2P-видеосвязь с автоматическим сурдопереводом речи в субтитры и наоборот —
без сторонних платных сервисов.

- Транспорт: [`go-p2p-netcat`](https://github.com/santaklouse/go-p2p-netcat)
  (libp2p + native WebRTC, pairing-токены `pnc1_`).
- Перевод: локальные / self-hosted open-source модели (Whisper, NLLB-200,
  Vosk, Argos/Bergamot, Piper — точный набор зависит от выбранного варианта).
- Платформа: определяется вариантом (PWA / desktop Tauri / Android).

Документы:

| Файл | Назначение |
|---|---|
| [`docs/PROPOSALS.md`](docs/PROPOSALS.md) | Варианты архитектуры (A/B/C/D), матрица сравнения, рекомендация. **Сначала прочитать.** |
| [`PLAN.md`](PLAN.md) | Живой план разработки: решения, бэклог, состояние, журнал. Его ведёт каждый агент/разработчик. |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | Технические факты по `go-p2p-netcat`, бесплатным ASR/MT/TTS и лицензиям. |

Кратко о вариантах (подробно — в `docs/PROPOSALS.md`):

- **A.** ⭐ **Выбран заказчиком (2026-11-07).** Всё в браузере: медиа через
  data channel (WebCodecs) + WASM-модели ASR/MT; серверов нет.
- **B.** PWA + нативное WebRTC; `go-p2p-netcat` — токен/аутентификация/
  control-канал (SDP, ICE, субтитры); перевод — WASM-фолбэк или свой
  `lingua-node`.
- **C.** Desktop (Tauri) + sidecar `p2p-nc` + локальные модели: полностью офлайн.
- **D.** Android-приложение (нужна доработка go-p2p-netcat под gomobile).

Статус: **выбран вариант A**, идёт bootstrap (P0). План работ —
[`PLAN.md`](PLAN.md), бэклог P3A/P5A — под WebCodecs-медиа и WASM-модели.
