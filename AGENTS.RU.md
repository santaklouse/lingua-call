[English](AGENTS.md) | **Русский**

# AGENTS.md — инструкция для агентов и контрибьюторов

Короткая версия. Полные правила и текущее состояние — в [`PLAN.md`](PLAN.md).

## Главное

1. **Источник истины — `PLAN.md`.** Перед работой прочитай разделы 0–6 и 9,
   затем найди в разделе 8 первую задачу `☐ TODO` с выполненными зависимостями.
2. **Один коммит = одна задача бэклога.** Если задача больше ~400 строк диффа —
   разбей её в бэклоге на подзадачи.
3. После задачи: статус `✅ DONE (дата, hash)`, обнови раздел 9 «Текущее
   состояние» и добавь запись в журнал (раздел 10). Не переписывай чужие записи.
4. Решения, меняющие архитектуру, фиксируй в разделе 2 (ADR-lite) с датой.
5. Не удаляй историю задач и журнала.

## Команды

```bash
bun install
bun run dev       # UI (Vite)
bun run typecheck
bun run lint
bun test
bun run build
```

## Жёсткие ограничения

- **Без платных сервисов и без серверов** (вариант A). Не добавляй облачные
  API, телеметрию, сторонние SDK с оплатой.
- **Лицензии моделей:** по умолчанию только MIT/Apache-2.0/MPL-2.0/CC-BY.
  NC/GPL/AGPL — только по отдельному решению (см. D11 в `PLAN.md`).
- **Не менять wire-инварианты `go-p2p-netcat`** (протоколы, pairing, auth,
  PTY-кадры) без отдельного решения. Внешний репозиторий:
  `/Users/alexnevpryaga/projects/santaklouse/go-p2p-netcat`.
- Не коммитить: модели, секреты, токены, `node_modules`, `dist`, бинари.
- Токен-приглашение — bearer-секрет: только в `#fragment` URL, не в
  localStorage, не в логах.

## Соглашения по коду

- TypeScript strict, без `any` без обоснования; ESLint+Prettier.
- Все тексты UI — через `@linguacall/i18n`.
- Публичные API пакетов — через `src/index.ts`.
- Ошибки типизированные; логи без содержимого речи в info-уровне.
- Тесты: unit (`bun test` + Testing Library/happy-dom) на публичное поведение; протокол — golden/fuzz.

## Secure context (камера/микрофон/речь)

Камера, микрофон и Web Speech требуют **secure context**. `http://localhost` —
можно; `http://192.168.x.x` — нельзя. Для реальных устройств используйте Docker +
Cloudflare Tunnel (`docker compose --profile tunnel up -d --build`, см.
`docs/TUNNEL.md`). Из-за этого звонок по LAN через HTTP обычно падает не из-за
WebRTC, а из-за отсутствия HTTPS.

## Подсказки по окружению

- Go: `/opt/homebrew/bin/go` (не `/usr/local/bin/go` — там старый Go 1.13).
- `scripts/check-prereq.mjs` проверяет Bun/Go/git.
- Если `bun install` в песочнице падает с `EPERM` tempdir, запускай:
  `BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache" TMPDIR="$PWD/.tmp" bun install`
  (каталоги уже в `.gitignore`).
- Публичные Nostr/WebTorrent signaling и STUN — бесплатные, но внешние;
  self-hosted замена — задел на будущее.
