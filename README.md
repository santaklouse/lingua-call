# LinguaCall (рабочее имя)

P2P-видеосвязь с автоматическим переводом речи в субтитры — без сторонних
платных сервисов и без серверов: всё работает в браузере.

- **Транспорт:** [`go-p2p-netcat`](https://github.com/santaklouse/go-p2p-netcat)
  (libp2p + native WebRTC, pairing-токены `pnc1_`).
- **Медиа:** WebCodecs (VP8/VP9/H.264 + Opus) поверх аутентифицированного
  data channel.
- **Речь:** WASM-модели в браузере (streaming-ASR sherpa-onnx/Vosk + MT
  Bergamot), приватно и бесплатно.
- **Выбранный вариант:** A — «всё в браузере» (решение 2026-11-07).

## Документы

| Файл | Назначение |
|---|---|
| [`PLAN.md`](PLAN.md) | Живой план: решения, бэклог, состояние, журнал. **Источник истины.** |
| [`docs/PROPOSALS.md`](docs/PROPOSALS.md) | Варианты архитектуры (A/B/C/D), матрица сравнения, решение. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Архитектура выбранного варианта (слои, протокол, медиа-конвейер). |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | Факты по `go-p2p-netcat`, бесплатным ASR/MT/TTS и лицензиям. |

## Быстрый старт

Требования: Node.js ≥ 22, pnpm ≥ 11. Go ≥ 1.25 — опционально (для сборки
`p2p-nc` и тестов совместимости).

```bash
node scripts/check-prereq.mjs
pnpm install
pnpm dev          # UI на http://localhost:5173
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Статус

Bootstrap (P0): репозиторий, pnpm-workspace, TypeScript/ESLint/Prettier,
Vitest, React+Vite каркас, i18n ru/en. Дальше — UI-экраны (P1), транспорт и
токены (P2), медиа WebCodecs (P3A), субтитры (P5/P5A).

## Лицензия

MIT. Модели и движки — только с допустимыми лицензиями (см. `PLAN.md` D11).
