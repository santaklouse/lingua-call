**English** | [Русский](AGENTS.RU.md)

# AGENTS.md — instructions for agents and contributors

Short version. Full rules and current state — in [`PLAN.md`](PLAN.md).

## Essentials

1. **The source of truth is `PLAN.md`.** Before starting work, read sections 0–6 and 9,
   then find in section 8 the first `☐ TODO` task with completed dependencies.
2. **One commit = one backlog task.** If a task is larger than ~400 lines of diff —
   split it into subtasks in the backlog.
3. After a task: status `✅ DONE (date, hash)`, update section 9 "Current
   state" and add an entry to the journal (section 10). Do not rewrite others' entries.
4. Record decisions that change the architecture in section 2 (ADR-lite) with a date.
5. Do not delete task and journal history.

## Commands

```bash
bun install
bun run dev       # UI (Vite)
bun run typecheck
bun run lint
bun test
bun run build
```

## Hard constraints

- **No paid services and no servers** (variant A). Do not add cloud
  APIs, telemetry, paid third-party SDKs.
- **Model licenses:** by default only MIT/Apache-2.0/MPL-2.0/CC-BY.
  NC/GPL/AGPL — only by a separate decision (see D11 in `PLAN.md`).
- **Do not change the wire invariants of `go-p2p-netcat`** (protocols, pairing, auth,
  PTY frames) without a separate decision. External repository:
  `/Users/alexnevpryaga/projects/santaklouse/go-p2p-netcat`.
- Do not commit: models, secrets, tokens, `node_modules`, `dist`, binaries.
- The invite token is a bearer secret: only in the URL `#fragment`, not in
  localStorage, not in logs.

## Code conventions

- TypeScript strict, no `any` without justification; ESLint+Prettier.
- All UI texts — through `@linguacall/i18n`.
- Public package APIs — through `src/index.ts`.
- Errors are typed; logs without speech content at info level.
- Tests: unit (`bun test` + Testing Library/happy-dom) for public behavior; protocol — golden/fuzz.

## Secure context (camera/mic/speech)

Camera, microphone and Web Speech require a **secure context**. `http://localhost`
is fine; `http://192.168.x.x` is not. For real devices use the Docker + Cloudflare
Tunnel setup (`docker compose --profile tunnel up -d --build`, see
`docs/TUNNEL.md`). This is also the reason a failing LAN call is usually an HTTP
problem, not a WebRTC bug.

## Environment hints

- Go: `/opt/homebrew/bin/go` (not `/usr/local/bin/go` — that one is the old Go 1.13).
- `scripts/check-prereq.mjs` checks Bun/Go/git.
- If `bun install` in the sandbox fails with a tempdir `EPERM`, run:
  `BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache" TMPDIR="$PWD/.tmp" bun install`
  (the directories are already in `.gitignore`).
- Public Nostr/WebTorrent signaling and STUN are free but external;
  a self-hosted replacement is groundwork for the future.
