# FINNY Commission Dashboard v2

Authenticated, role-based commission dashboard with live Attio integration and daily Slack updates.

## What's New in v2

- **Token-based auth** — all routes require a valid token (no more public access)
- **Individual rep dashboards** — each rep sees only their own quota progress
- **Austin removed** — only Jason, Kelcy, and Max
- **Server-side comp data** — salary/OTE/tier rates never ship to the browser
- **Fixed OWNER_MAP bug** — no more empty-string key collisions
- **Generic error messages** — no Attio internals leaked to clients
- **Dynamic month** — no more hardcoded "February"

## Routes

| URL | Who | What |
|-----|-----|------|
| `/?token=EXEC` | Leadership | All reps, manual + live mode |
| `/dashboard/kelcy?token=KELCY` | Kelcy | Her quota progress only |
| `/dashboard/jason?token=JASON` | Jason | His quota progress only |
| `/dashboard/max?token=MAX` | Max | His meeting progress only |
| `/api/commissions?token=EXEC&live=true` | Internal | Full JSON (exec only) |
| `/api/commissions/rep/kelcy?token=KELCY` | Per-rep | Single rep JSON |
| `/api/cron/daily-commission` | Vercel Cron | Daily Slack post (6 PM ET) |

## Setup

### 1. Generate auth tokens

```bash
# Run 4 times — one for exec, one per rep
openssl rand -hex 16
```

### 2. Add env vars

Copy `.env.local` and fill in your values. For Vercel, add all variables in Settings → Environment Variables.

Required env vars:
- `ATTIO_API_KEY` — read-only Attio API key
- `ATTIO_JASON_UUID`, `ATTIO_KELCY_UUID`, `ATTIO_MAX_UUID`
- `TOKEN_EXEC`, `TOKEN_KELCY`, `TOKEN_JASON`, `TOKEN_MAX`
- `SLACK_WEBHOOK_URL` — Slack incoming webhook
- `CRON_SECRET` — for Vercel cron auth

### 3. Deploy

**Option A: GitHub upload (no terminal)**
1. Create a private repo on github.com/new
2. Upload all files via the web UI
3. Import in vercel.com/new
4. Add env vars in Vercel Settings
5. Deploy

**Option B: CLI**
```bash
npm install
npm run dev  # Test locally at http://localhost:3000/?token=YOUR_EXEC_TOKEN

git init && git add . && git commit -m "v2"
gh repo create finny-commission-dashboard-v2 --private --push
npx vercel --prod
```

### 4. Share dashboard links

DM each person their unique link:
- **You:** `https://your-app.vercel.app/?token=EXEC_TOKEN`
- **Kelcy:** `https://your-app.vercel.app/dashboard/kelcy?token=KELCY_TOKEN`
- **Jason:** `https://your-app.vercel.app/dashboard/jason?token=JASON_TOKEN`
- **Max:** `https://your-app.vercel.app/dashboard/max?token=MAX_TOKEN`

### 5. Test cron

```bash
curl https://your-app.vercel.app/api/cron/daily-commission \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Security Notes

- All comp data (salary, OTE, variable, tier rates) is server-only — never in the JS bundle
- Rep dashboards only return that rep's calculated metrics
- Tokens are validated in both middleware and API routes (defense in depth)
- Error messages are generic — no Attio internals leak to clients
- `robots: noindex, nofollow` prevents search engine indexing
- Attio API key should be read-only and scoped to deals + people
