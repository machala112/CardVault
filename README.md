# CardVault

A gift-card / voucher code validation system. Users sign up, get a **permanent
personal share link**, and anyone opening that link can validate card codes
against the owner's code list. Admins manage everything from an Android app
with **instant push notifications** on every validation.

## Architecture

```
┌──────────────┐      ┌─────────────────────────────────────────┐
│  Dashboard   │─────▶│  Cloudflare Worker (workers/api)        │
│  (static,    │      │  · Auth: signup / signin (PBKDF2, D1)   │
│   served by  │      │  · Permanent share links (one per user) │
│   the Worker)│      │  · Card validation (atomic in D1)       │
└──────────────┘      │  · Image upload → R2                    │
                      │  · Admin API                            │
┌──────────────┐      │  · Firebase push on every validation    │
│  Admin APK   │─────▶│                                         │
│  (Expo)      │      └──────┬──────────────────┬───────────────┘
└──────────────┘             │                  │
                        ┌────▼────┐        ┌────▼────┐
                        │ D1 (DB) │        │ R2 (img)│
                        └─────────┘        └─────────┘
```

- **Cloudflare Workers** — the entire backend (`workers/api/src/`): auth,
  links, validation, uploads, admin endpoints. Also serves the dashboard.
- **Cloudflare D1** — database: `users`, `sessions`, `share_links`,
  `card_codes`, `card_validations`, `push_tokens`.
  Schema: `workers/api/migrations/0001_init.sql`.
- **Cloudflare R2** — card image storage (bucket `cardvault-images`),
  served back via `/img/<key>`.
- **Firebase Cloud Messaging** — instant push to admin phones on every
  validation (replaces polling). The Worker mints its own OAuth token from
  a service-account secret; no Firebase Admin SDK needed.

## Project layout

```
CardVault/
├── workers/api/            ← Cloudflare Worker backend
│   ├── src/index.js        ← router + all endpoints
│   ├── src/auth.js         ← PBKDF2 hashing, sessions, link tokens
│   ├── src/fcm.js          ← Firebase Cloud Messaging sender
│   └── migrations/0001_init.sql  ← D1 schema
├── dashboard/              ← static SPA (signup/signin, my link, validation)
├── admin-apk/              ← Expo admin Android app
├── wrangler.toml
└── .github/workflows/
    ├── deploy-worker.yml   ← deploys Worker + dashboard + D1 migrations
    └── build-apk.yml       ← builds the admin APK
```

## One-time setup

### 1. Cloudflare

```bash
npm i -g wrangler
wrangler login
wrangler d1 create cardvault-db        # paste database_id into wrangler.toml
wrangler r2 bucket create cardvault-images
wrangler d1 execute cardvault-db --file workers/api/migrations/0001_init.sql --remote
wrangler secret put FCM_SERVICE_ACCOUNT_JSON   # Firebase service-account JSON (see below)
wrangler secret put ADMIN_EMAIL                # your email → becomes admin on signup
wrangler deploy
```

### 2. Firebase (push notifications)

1. In the [Firebase console](https://console.firebase.google.com), create a
   project (or reuse one) and add an **Android** app with your package name.
2. Download `google-services.json` → store it as the repo secret
   `GOOGLE_SERVICES_JSON` (Settings → Secrets → Actions). The APK workflow
   writes it at build time; it is never committed.
3. Project Settings → Service accounts → **Generate new private key** →
   paste the JSON into `wrangler secret put FCM_SERVICE_ACCOUNT_JSON`.

### 3. GitHub secrets

| Secret | Used by | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | deploy-worker | Worker deploys |
| `CLOUDFLARE_ACCOUNT_ID` | deploy-worker | Worker deploys |
| `API_URL` | build-apk | Worker URL baked into the APK (`EXPO_PUBLIC_API_URL`) |
| `GOOGLE_SERVICES_JSON` | build-apk | Firebase config for push |

## Using it

1. Open the deployed Worker URL → **sign up** (the `ADMIN_EMAIL` address
   becomes the admin).
2. Your **share link** is on the home screen — copy it and send it to
   whoever needs to validate cards. It never expires; regenerate it anytime
   if it leaks.
3. Add card codes from the admin APK (Codes tab), or insert directly:
   ```bash
   wrangler d1 execute cardvault-db --remote \
     --command "INSERT INTO card_codes (id, code, notes, created_at)
                VALUES (lower(hex(randomblob(16))), 'MY-CODE-001', 'Batch 1', datetime('now'))"
   ```
4. Anyone opening your link can validate a code (+ optional card photo).
   You get an **instant push** on your admin phone for every attempt.

## API reference

All JSON. Authenticated calls send `Authorization: Bearer <token>`.

| Method & path | Auth | Description |
|---|---|---|
| `POST /api/auth/signup` | – | `{email, password, name}` → `{user, token, link}` |
| `POST /api/auth/signin` | – | `{email, password}` → `{user, token}` |
| `POST /api/auth/signout` | user | Invalidate session |
| `GET /api/auth/me` | user | Current user |
| `GET /api/links/mine` | user | Your permanent share link |
| `POST /api/links/regenerate` | user | New link, old one dies |
| `GET /api/links/resolve?token=` | – | Check a share link |
| `POST /api/upload` | link | Multipart `image` + `link_token` → `{image_url}` |
| `POST /api/validate` | link | `{code, link_token, image_url?}` → `{status, code}` |
| `GET /img/<key>` | – | Stored card image |
| `GET /api/admin/validations` | admin | List, `?limit&status` |
| `GET /api/admin/validations/:id` | admin | Detail |
| `GET /api/admin/stats` | admin | Counts |
| `GET /api/admin/codes` | admin | Code list |
| `POST /api/admin/codes` | admin | Add `{code, notes}` |
| `DELETE /api/admin/codes/:id` | admin | Remove |
| `POST /api/admin/push-tokens` | admin | Register FCM device token |

Validation statuses: `valid` (first use, now marked used), `used`
(already redeemed), `invalid` (unknown code).

## Local development

```bash
# Terminal 1 — Worker + dashboard with a local D1
npx wrangler dev --local
# Terminal 2 — admin app
cd admin-apk && EXPO_PUBLIC_API_URL=http://localhost:8787 npx expo start
```

## Security notes

- Passwords: PBKDF2-SHA256, 100k iterations, per-user salt. Sessions are
  opaque random tokens, 30-day expiry.
- No keys are committed anywhere. The Worker reads secrets via
  `wrangler secret`; the dashboard needs none; the APK gets its config
  from build-time secrets.
- The share link **is** the credential for the public validation page —
  treat it like a password and regenerate it if shared too widely.
