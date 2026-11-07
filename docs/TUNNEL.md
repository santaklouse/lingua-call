# HTTPS access with Cloudflare Tunnel

**English** | [Русский](TUNNEL.RU.md)

This guide explains why the app needs HTTPS for real devices, and how to expose
the Docker deployment on a public HTTPS hostname with a Cloudflare Zero Trust
tunnel.

## Why HTTPS is required

Browsers only expose powerful media and speech APIs in a **secure context**:

- `navigator.mediaDevices.getUserMedia()` — camera and microphone
- Web Speech API (`SpeechRecognition`, `speechSynthesis`) in Chrome/Edge
- `crypto.getRandomValues` for invite codes (fine on localhost)
- AudioWorklet / WebCodecs features used by the translation pipeline

`http://localhost` is a special case and works, but `http://192.168.x.x`,
`http://10.x.x.x` or a raw public IP over HTTP do **not**: the camera/mic prompt
never appears and speech recognition throws `not-allowed`. A Cloudflare Tunnel
gives you a real HTTPS domain even when the machine is behind NAT.

```
Browser (HTTPS) ──► Cloudflare edge ──tunnel──► cloudflared container
                                                   │
                                                   ▼
                                            web container (nginx :80)
                                            static Vite build
```

The tunnel is outbound-only: no ports need to be opened on your router, and
Cloudflare does not need access to your local network.

## What you need

- Docker Desktop / Docker Engine with Compose v2
- A domain managed by Cloudflare (nameservers pointed at Cloudflare)
- A free Cloudflare account with **Zero Trust** enabled

## 1. Create the tunnel in the Cloudflare dashboard

1. Open **Cloudflare Zero Trust** → **Networks** → **Tunnels**
   (direct link: `https://one.dash.cloudflare.com/` → Networks → Tunnels).
2. Click **Create a tunnel**.
3. Choose **Cloudflared** as the connector, then **Next**.
4. Name it, for example `linguacall`, and **Save tunnel**.
5. In the **Install connector** step, select the **Docker** tab and copy the
   command. It looks like:
   ```bash
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoi...
   ```
   Copy only the token value after `--token` — that is
   `CLOUDFLARE_TUNNEL_TOKEN` for the compose file.
6. Keep the page open: the next step adds a public hostname.


> **Cross-device quick calls:** the compose stack includes a self-hosted
> WebSocket signaling service (`signal`). nginx proxies it at `/signal` on the
> same hostname, so the "Quick test" room code works between different devices
> and browsers — no extra Cloudflare hostname is needed. Rebuild after pulling
> changes: `docker compose --profile tunnel up -d --build`.

## 2. Add a public hostname

Still on the tunnel page, open the **Public Hostname** tab → **Add a public
hostname**:

| Field | Value |
|---|---|
| Subdomain | `linguacall` (or any subdomain) |
| Domain | your Cloudflare-managed domain |
| Path | *(leave empty)* |
| Service · Type | `HTTP` |
| Service · URL | `web:80` |

The URL uses the **Docker Compose service name** `web`; `cloudflared` and `web`
share the same compose network, so Docker DNS resolves it.

If your dashboard offers "Additional application settings", leave the defaults.
Save the hostname.

> Prefer a config-file tunnel? The token mode is simpler and works with the
> Docker image; named-tunnel credentials files are not needed here.

## 3. Start the stack

```bash
cp .env.example .env
# put the token into .env:
# CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
docker compose --profile tunnel up -d --build
docker compose ps
docker compose logs -f cloudflared
```

Wait for `cloudflared` to report `Registered tunnel connection`. Then open:

```
https://linguacall.<your-domain>/
```

Test from a phone: the camera/microphone prompt should now appear, and
"Live translation demo" should work with Web Speech + Chrome Translator.

## 4. Local preview (optional)

Without the tunnel:

```bash
docker compose up -d --build web
# http://localhost:8080
```

`localhost` is a secure context, so camera/mic work there; other devices on the
LAN will not be able to use media over plain HTTP.

## 5. Restrict access (recommended)

The tunnel URL is public by default. For private testing, add a **Zero Trust
Access** application:

1. **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application domain: `linguacall.<your-domain>`.
3. Add a policy, e.g. **Allow** → emails of the people who may test.
4. Save. Cloudflare now shows a login page before the app loads.

## 6. Update or rotate

- Change the public hostname: tunnel page → **Public Hostname** → edit.
- Rotate the token: tunnel page → **Configure** → **Refresh token**, update
  `.env`, then `docker compose --profile tunnel up -d`.
- Delete the tunnel: remove the public hostname, delete the tunnel in the
  dashboard, then `docker compose --profile tunnel down`.

## Troubleshooting

| Symptom | Check |
|---|---|
| Cloudflare error 502/1033 | `docker compose ps` — `web` must be healthy; `cloudflared` logs should show the tunnel registered; service URL must be `web:80`, not `localhost:80` |
| `cloudflared` exits immediately | token missing/wrong in `.env`; the compose file fails fast when `CLOUDFLARE_TUNNEL_TOKEN` is unset |
| Camera prompt does not appear | open the `https://` URL, not the IP; check browser site permissions; try Chrome/Edge |
| Speech recognition `not-allowed` | same secure-context cause; also ensure the page is not inside a restrictive iframe |
| Tunnel works, app shows 404 on refresh | nginx SPA fallback should handle it — verify `deploy/nginx.conf` is used (`docker compose logs web`) |
| Outbound blocked network | `cloudflared` needs outbound TCP/UDP 7844 to Cloudflare; some corporate networks block it |

## Security notes

- Treat `CLOUDFLARE_TUNNEL_TOKEN` as a secret; `.env` is git-ignored.
- The application is a static client: Cloudflare serves files but does not run
  any translation/media logic. Media and speech stay in the browser (prototype
  engines may use browser-vendor services — see PLAN.md D22).
- Invite tokens (`pnc1_…` / room codes) remain bearer secrets; do not post them
  publicly.
