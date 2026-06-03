# MarketIntel — Deployment Guide
# GitHub + Vercel (frontend) + Supabase (database + auth) + GitHub Actions (scheduled scans)
# Total cost: Anthropic API only (~£7/month). Everything else is FREE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — SUPABASE (database + auth)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to https://supabase.com and sign up (free)
2. Click "New Project", give it a name like "marketintel"
3. Choose a strong database password (save it)
4. Wait ~2 minutes for it to set up

5. Go to SQL Editor → New Query
6. Copy the entire contents of supabase-setup.sql
7. Paste it in and click "Run"
   → This creates all your tables and security rules

8. Go to Settings → API
9. Copy these two values (you'll need them soon):
   - Project URL (looks like: https://xxxxx.supabase.co)
   - anon public key (long string starting with eyJ...)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — GITHUB (code storage)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to https://github.com (you already have an account)
2. Click "New repository"
3. Name it: marketintel (or whatever you prefer)
4. Set it to PRIVATE (important — keeps your code private)
5. Click "Create repository"

6. Upload all the project files:
   - Click "uploading an existing file"
   - Drag and drop ALL the files from the zip
   - Keep the folder structure exactly as it is
   - Click "Commit changes"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — VERCEL (frontend hosting)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to https://vercel.com (you already have an account)
2. Click "Add New Project"
3. Import your GitHub repo (marketintel)
4. Framework preset: select "Vite"
5. Before deploying, click "Environment Variables" and add:

   VITE_SUPABASE_URL        → paste your Supabase Project URL
   VITE_SUPABASE_ANON_KEY   → paste your Supabase anon key
   VITE_ADMIN_EMAIL         → your email address

6. Click "Deploy"
7. Vercel gives you a URL like: https://marketintel-xyz.vercel.app

   That's your app URL. Share this with people.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — SET YOURSELF AS ADMIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to your Vercel URL
2. Sign up with your email and password
3. You'll see "pending approval" — that's fine

4. Go back to Supabase → SQL Editor → New Query
5. Run this (replace with your actual email):

   update public.profiles
   set is_admin = true, status = 'approved'
   where email = 'your@email.com';

6. Refresh the app — you now have full admin access
7. Go to /admin.html to manage other users

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — GITHUB ACTIONS (free scheduled scans)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Get your Anthropic API key:
   - Go to https://console.anthropic.com
   - API Keys → Create Key → copy it
   - Billing → add card → load £50

2. Get your Supabase service key:
   - Supabase → Settings → API
   - Copy "service_role" key (NOT the anon key — this one has write access)

3. Go to your GitHub repo
4. Settings → Secrets and variables → Actions → New repository secret

   Add these 3 secrets:
   ANTHROPIC_API_KEY    → your Anthropic key (sk-ant-...)
   SUPABASE_URL         → your Supabase project URL
   SUPABASE_SERVICE_KEY → your Supabase service_role key

5. Go to Actions tab in your GitHub repo
6. You should see "Market Intel Scan" workflow
7. Click it → "Run workflow" to test it manually right now

If it goes green ✓ — your scheduled scans are working.
They will now fire automatically at 07:00, 15:00, 23:00 every day for FREE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — INVITE PEOPLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Share your Vercel URL with whoever you want to give access to
2. They click "Request Access", sign up with email + password
3. You get an email notification
4. Go to your-url/admin.html
5. Click "Approve" next to their name
6. They can now access the full dashboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATING THE APP IN FUTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Whenever you want changes:
1. Tell Claude what you want changed
2. Claude gives you the updated file
3. Go to GitHub → find the file → click edit (pencil icon) → paste new code → commit
4. Vercel automatically redeploys within 30 seconds
5. Done — no terminal, no commands

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Supabase          FREE (up to 500MB, more than enough)
Vercel            FREE
GitHub            FREE
GitHub Actions    FREE (2,000 minutes/month included — you use ~6/day)
Anthropic API     ~£7/month (3 scans/day, Sonnet 4.6)

TOTAL: ~£7/month. Nothing else.
