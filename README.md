# CardValidator — Full Stack System

A complete card validation system with a mirror-glass frontend website and a professional Android admin app with real-time push notifications.

---

## 📁 Project Structure

```
CardValidator/
├── dashboard/              ← Frontend website (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── sql/
│   └── schema.sql          ← Supabase database schema + functions
└── admin-apk/              ← Android admin app (React Native / Expo)
    ├── App.js
    ├── app.json
    ├── eas.json
    ├── package.json
    ├── babel.config.js
    ├── src/
    │   ├── screens/
    │   │   ├── DashboardScreen.js
    │   │   ├── AllValidationsScreen.js
    │   │   ├── ValidationDetailScreen.js
    │   │   └── SettingsScreen.js
    │   ├── components/
    │   │   ├── StatCard.js
    │   │   └── ValidationRow.js
    │   ├── services/
    │   │   ├── supabase.js
    │   │   └── backgroundService.js
    │   └── theme.js
    └── .github/
        └── workflows/
            └── build-apk.yml   ← GitHub Actions CI/CD
```

---

## 🗄️ Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project
2. Open **SQL Editor** → paste and run `sql/schema.sql`
3. Go to **Storage** → create a bucket named `card-images` → set to **public**
4. Note your **Project URL** and **anon public key** (Settings → API)
5. Note your **service role key** (keep secret — admin only)

---

## 🌐 Step 2 — Frontend Dashboard

Edit `dashboard/app.js`, lines 6–7:

```js
const SUPABASE_URL  = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';
```

Then open `dashboard/index.html` in any browser. No server needed — it's pure static HTML/JS/CSS.

**To host it:**
- Drag the `dashboard/` folder to [Netlify Drop](https://app.netlify.com/drop)
- Or push to GitHub and enable Pages
- Or use Vercel, Cloudflare Pages, etc.

---

## 📱 Step 3 — Admin APK

### Prerequisites
```bash
npm install -g eas-cli
eas login
```

### Configure credentials

Keys are injected at build time — never committed. For **local** builds, create `admin-apk/.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
```

For **GitHub Actions** builds, add these **repository secrets** (Settings → Secrets → Actions):

### Build locally
```bash
cd admin-apk
npm install
eas build --platform android --profile production
```

### Build via GitHub Actions (CI/CD)

1. Push this repo to GitHub
2. Add these **repository secrets** (Settings → Secrets → Actions):
   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SERVICE_KEY` — your service role key
3. Push to `main` branch → Actions tab → APK builds automatically
4. Download APK from the **Artifacts** tab

### Install APK
- Enable **Unknown sources** on your Android device
- Download and install `cardvalidator-admin.apk`

---

## 🔔 Notification Sound (Hardcore)

Place your custom audio file at:
```
admin-apk/assets/sounds/hardcore.mp3
```

The app uses this as the notification sound. You can swap it for any `.mp3` file. The Settings screen lets you choose from multiple sound options.

---

## ♻️ Heartbeat / Keep-Alive

The admin APK runs a **background task every 30 seconds** that:
1. Pings Supabase to check for new card validations
2. Keeps the Realtime WebSocket connection alive
3. Sends push notifications for new validations
4. Runs even when the app is closed or the phone is rebooted

The frontend website has no backend to keep alive — Supabase handles this automatically.

---

## 🗃️ Supabase Tables

| Table | Purpose |
|-------|---------|
| `card_validations` | Every validation attempt (code, image, status, IP) |
| `card_codes` | Master list of valid codes with used/unused state |

### Add card codes (SQL Editor):
```sql
INSERT INTO card_codes (code, notes) VALUES
  ('MY-CODE-001', 'Batch 1'),
  ('MY-CODE-002', 'Batch 1');
```

---

## 🔑 Security Notes

- The **anon key** is safe to use in the frontend (RLS policies restrict access)
- The **service role key** is only used in the admin APK and GitHub secrets — never in the frontend
- All validation data is stored with IP and user agent for audit purposes
- The `validate_card_code` SQL function atomically marks codes as used to prevent race conditions

---

## 📦 Assets Needed

Create placeholder files (or add real ones):
```
admin-apk/assets/icon.png           (1024×1024)
admin-apk/assets/splash.png         (1284×2778)
admin-apk/assets/adaptive-icon.png  (1024×1024)
admin-apk/assets/notification-icon.png (96×96, white on transparent)
admin-apk/assets/sounds/hardcore.mp3
```
