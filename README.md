# FINNY Commission Bot — Daily Slack Summary

Automated daily Slack post at **6:00 PM ET** with February commission numbers for all AEs + Max's BDR metrics. Runs as a Vercel Cron Job, pulls live data from Attio.

## What It Posts

```
📊 February Commission Update — Thursday, February 13

Team Totals:  Net ARR: $234,000  |  Total Commission: $19,260

🔵 Jason Vigilante  📈
▓▓▓▓░░░░░░  43.2% attainment
Gross ARR: $84,000  →  Net: $72,000  (12 deals, $12,000 churned)
Commission: $6,480  |  vs Target: -$3,520

🟢 Austin Guest  🔥
▓▓▓▓▓▓▓▓▓▓  147.6% attainment
Gross ARR: $270,000  →  Net: $246,000  (30 deals, $24,000 churned)
Commission: $24,647  |  vs Target: +$14,647

🟡 Kelcy Koenig  ⏳
▓▓▓▓▓▓▓▓░░  84.0% attainment
Gross ARR: $162,000  →  Net: $126,000  (21 deals, $36,000 churned)
Commission: $5,040  |  vs Target: -$960

───────────────────

🟣 Max Zajec (BDR)  ⏳
▓▓▓▓░░░░░░  46.7% attainment
Meetings: 7 / 15 target
Commission: $231  |  vs Target: -$602
```

---

## Setup (15 minutes)

### Step 1: Create Slack Incoming Webhook

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it "FINNY Commission Bot", select your workspace
3. Go to **Incoming Webhooks** → Toggle **ON**
4. Click **Add New Webhook to Workspace** → select your target channel (e.g., `#sales-commissions`)
5. Copy the webhook URL — looks like `https://hooks.slack.com/services/T.../B.../xxx`

### Step 2: Get Attio Workspace Member UUIDs

You need each AE's workspace member UUID so the bot can map deal owners. Run this in your terminal:

```bash
curl -s https://api.attio.com/v2/workspace_members \
  -H "Authorization: Bearer YOUR_ATTIO_API_KEY" | python3 -m json.tool
```

Look for each person's `id.workspace_member_id` — you'll need Jason's, Austin's, Kelcy's, and Max's.

### Step 3: Verify Your Attio Attribute Slugs

The bot queries deals using attribute slugs. Run this to see your deals schema:

```bash
curl -s https://api.attio.com/v2/objects/deals/attributes \
  -H "Authorization: Bearer YOUR_ATTIO_API_KEY" | python3 -m json.tool
```

Check that these slugs match (update `route.ts` if they differ):
- `close_date` — your Close Date attribute
- `stage` — deal stage (usually "stage")
- `value` — deal value (usually "value")
- `owner` — deal owner (usually "owner")
- `associated_people` — linked people
- `lead_owner` — Max's lead owner field (for BDR meeting counting)

Also check your churn tracking attribute on the People object:
```bash
curl -s https://api.attio.com/v2/objects/people/attributes \
  -H "Authorization: Bearer YOUR_ATTIO_API_KEY" | python3 -m json.tool
```

Update the `churn_reason` slug in the code if yours is different.

### Step 4: Deploy to Vercel

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "FINNY commission bot"
gh repo create finny-commission-bot --private --push

# 2. Deploy
npx vercel link
npx vercel env add ATTIO_API_KEY          # paste your key
npx vercel env add ATTIO_JASON_UUID       # paste UUID
npx vercel env add ATTIO_AUSTIN_UUID      # paste UUID
npx vercel env add ATTIO_KELCY_UUID       # paste UUID
npx vercel env add ATTIO_MAX_UUID         # paste UUID
npx vercel env add SLACK_WEBHOOK_URL      # paste webhook URL
npx vercel env add CRON_SECRET            # generate: openssl rand -hex 32
npx vercel --prod
```

### Step 5: Test It

Trigger the cron manually (replace with your deployed URL):

```bash
curl -X GET https://your-app.vercel.app/api/cron/daily-commission \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

You should see a message appear in your Slack channel within seconds.

---

## Architecture

```
Vercel Cron (daily 23:00 UTC / 6 PM ET)
    → GET /api/cron/daily-commission
    → Serverless function:
        1. Query Attio deals (Feb close date, Closed Won stages)
        2. Query Attio people (churn status for associated contacts)
        3. Map deals to AEs via owner UUID
        4. Calculate tiered commissions per AE
        5. Count Max's qualified meetings
        6. Post formatted Block Kit message to Slack
```

## Things You May Need to Customize

| What | Where | Why |
|------|-------|-----|
| Attio attribute slugs | `route.ts` → `fetchFebruaryDeals()` | Your close_date slug may differ |
| Deal stage names | `route.ts` → filter `$or` block | If you use different stage labels |
| Churn detection logic | `route.ts` → `fetchChurnedPeople()` | If churn lives on Users not People |
| Max's meeting counting | `route.ts` → BDR section | May need a different query approach |
| Commission rates | `route.ts` → `AE_CONFIG` / `BDR_CONFIG` | If comp plans change |
| Cron schedule | `vercel.json` → `schedule` | `"0 23 * * 1-5"` for weekdays only |

## Cost

Free on Vercel Hobby tier. One cron invocation/day = ~30 cron runs/month (Hobby allows 2/day). Two Attio API calls per run = 60 reads/month (well under the 100/sec rate limit).

**Note:** Vercel Hobby is technically for personal/non-commercial use. For a team tool, Vercel Pro at $20/month is the proper tier and also gives you more cron frequency options.
