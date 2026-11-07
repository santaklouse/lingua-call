# HTTPS-доступ через Cloudflare Tunnel

[English](TUNNEL.md) | **Русский**

Это руководство объясняет, зачем приложению нужен HTTPS на реальных
устройствах, и как выставить Docker-сборку на публичный HTTPS-домен через
туннель Cloudflare Zero Trust.

## Зачем нужен HTTPS

Браузеры дают доступ к медиа и речи только в **secure context**:

- `navigator.mediaDevices.getUserMedia()` — камера и микрофон;
- Web Speech API (`SpeechRecognition`, `speechSynthesis`) в Chrome/Edge;
- `crypto.getRandomValues` для кодов-приглашений;
- AudioWorklet / WebCodecs, которые использует пайплайн перевода.

`http://localhost` — исключение и работает, а `http://192.168.x.x`,
`http://10.x.x.x` или публичный IP по HTTP — **нет**: запрос камеры не
появляется, распознавание речи падает с `not-allowed`. Туннель Cloudflare даёт
настоящий HTTPS-домен даже за NAT.

```
Браузер (HTTPS) ──► Cloudflare edge ──туннель──► контейнер cloudflared
                                                     │
                                                     ▼
                                              контейнер web (nginx :80)
                                              статическая сборка Vite
```

Туннель исходящий: не нужно открывать порты на роутере, а Cloudflare не получает
доступ к локальной сети.

## Что нужно

- Docker Desktop / Docker Engine с Compose v2
- Домен, управляемый Cloudflare (NS указывают на Cloudflare)
- Бесплатный аккаунт Cloudflare с включённым **Zero Trust**

## 1. Создайте туннель в панели Cloudflare

1. Откройте **Cloudflare Zero Trust** → **Networks** → **Tunnels**
   (`https://one.dash.cloudflare.com/` → Networks → Tunnels).
2. Нажмите **Create a tunnel**.
3. Выберите коннектор **Cloudflared** → **Next**.
4. Назовите, например `linguacall`, и нажмите **Save tunnel**.
5. На шаге **Install connector** выберите вкладку **Docker** и скопируйте
   команду:
   ```bash
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoi...
   ```
   Нужен только токен после `--token` — это
   `CLOUDFLARE_TUNNEL_TOKEN` для compose-файла.
6. Не закрывайте страницу: дальше добавим публичный хостнейм.


> **Быстрые звонки между устройствами:** в compose-стек входит собственный
> WebSocket-signaling (`signal`). nginx проксирует его по `/signal` на том же
> домене, поэтому код комнаты «Quick test» работает между разными устройствами и
> браузерами — отдельный хостнейм в Cloudflare не нужен. После обновления
> пересоберите: `docker compose --profile tunnel up -d --build`.

## 2. Добавьте публичный хостнейм

На странице туннеля откройте вкладку **Public Hostname** →
**Add a public hostname**:

| Поле | Значение |
|---|---|
| Subdomain | `linguacall` (или любой поддомен) |
| Domain | ваш домен в Cloudflare |
| Path | *(пусто)* |
| Service · Type | `HTTP` |
| Service · URL | `web:80` |

URL использует **имя сервиса Docker Compose** `web`: `cloudflared` и `web` в
одной сети, поэтому Docker DNS его резолвит.

Дополнительные настройки оставьте по умолчанию. Сохраните хостнейм.

> Хотите туннель через конфиг-файл? Режим токена проще и работает с Docker
> образом; файлы credentials для named tunnel здесь не нужны.

## 3. Запустите стек

```bash
cp .env.example .env
# вставьте токен в .env:
# CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
docker compose --profile tunnel up -d --build
docker compose ps
docker compose logs -f cloudflared
```

Дождитесь в логах `Registered tunnel connection`. Откройте:

```
https://linguacall.<ваш-домен>/
```

Проверьте с телефона: запрос камеры/микрофона теперь должен появиться, а
«Live translation demo» — работать с Web Speech + Chrome Translator.

## 4. Локальный предпросмотр (опционально)

Без туннеля:

```bash
docker compose up -d --build web
# http://localhost:8080
```

`localhost` — secure context, камера/микрофон работают; другие устройства в
LAN по обычному HTTP медиа использовать не смогут.

## 5. Ограничьте доступ (рекомендуется)

URL туннеля по умолчанию публичный. Для приватного теста добавьте приложение
**Zero Trust Access**:

1. **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application domain: `linguacall.<ваш-домен>`.
3. Политика, например **Allow** → email тех, кому можно тестировать.
4. Сохраните. Cloudflare покажет страницу входа до загрузки приложения.

## 6. Обновление и ротация

- Сменить хостнейм: страница туннеля → **Public Hostname** → изменить.
- Ротировать токен: страница туннеля → **Configure** → **Refresh token**,
  обновить `.env`, затем `docker compose --profile tunnel up -d`.
- Удалить туннель: удалить публичный хостнейм и туннель в панели, затем
  `docker compose --profile tunnel down`.

## Диагностика

| Симптом | Что проверить |
|---|---|
| Ошибка Cloudflare 502/1033 | `docker compose ps` — `web` должен быть healthy; в логах `cloudflared` должно быть `Registered tunnel connection`; service URL — `web:80`, не `localhost:80` |
| `cloudflared` сразу падает | токен отсутствует/неверный в `.env`; compose падает, если `CLOUDFLARE_TUNNEL_TOKEN` не задан |
| Нет запроса камеры | открывайте `https://`-URL, а не IP; проверьте разрешения сайта; используйте Chrome/Edge |
| Распознавание речи `not-allowed` | та же причина secure context; также проверьте, что страница не в ограничительном iframe |
| 404 при обновлении страницы | должен работать SPA fallback nginx — проверьте, что используется `deploy/nginx.conf` (`docker compose logs web`) |
| Корпоративная сеть блокирует исходящие | `cloudflared` нужен исходящий TCP/UDP 7844 к Cloudflare |

## Безопасность

- `CLOUDFLARE_TUNNEL_TOKEN` — секрет; `.env` в `.gitignore`.
- Приложение — статический клиент: Cloudflare отдаёт файлы, но не выполняет
  перевод/медиа. Медиа и речь остаются в браузере (прототипные движки могут
  использовать сервисы вендора — см. PLAN.md D22).
- Токены-приглашения (`pnc1_…` / коды комнат) — bearer-секреты, не публикуйте их.
