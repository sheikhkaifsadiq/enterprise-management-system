# ERP System — Self-Hosting & Migration Guide

> ⚠️ **This is a standalone export of the project.**
> It is **no longer connected to Lovable** or the Lovable Cloud backend that powered the
> preview at `https://id-preview--20dc32f7-0166-425b-a373-faa43e9e68fe.lovable.app`.
> You are responsible for provisioning your own database, secrets, and hosting.

This document describes the project end-to-end and walks you through running it
locally and deploying it to your own infrastructure (Supabase + any Node-capable
host such as Vercel, Cloudflare Workers, Netlify, Fly.io, Render, or a VPS).

---

## 1. What This Project Is

A modern, offline-capable **ERP** for retail / SMB. Modules:

| Module | Description |
| --- | --- |
| **Auth & Roles** | Email+password and Google OAuth. Salted+peppered passwords (HMAC-SHA256 with `PEPPER_SECRET`). IP brute-force lockout. Roles: Super Admin, Admin, Manager, Cashier. |
| **Catalog & Inventory** | Products (with image upload to Storage), categories, barcode/QR generation, CSV bulk import, low-stock alerts, damage logs. |
| **Multi-Warehouse** | Warehouses and atomic stock transfers with full audit trail. |
| **POS & Sales** | Checkout, promotions/coupons, customers, orders, PDF invoices. |
| **Analytics** | YoY KPIs, multi-select filters, Excel + PDF exports, server-side pagination. |
| **Realtime** | Postgres change feeds auto-refresh orders, inventory, transfers. |
| **Audit Log** | Immutable JSON diffs of every INSERT/UPDATE/DELETE on core tables (admin only). |
| **Offline / PWA** | Service worker, cached product list, queued POS orders that auto-sync. |
| **Daily Reports** | pg_cron schedules a POST to `/api/public/hooks/daily-report` at 06:00 UTC; optional Resend email dispatch. |

### Tech Stack
- **Framework:** TanStack Start v1 (React 19, Vite 7, SSR)
- **Styling:** Tailwind CSS v4 + shadcn/ui + Framer Motion
- **Backend:** Supabase — Postgres, Auth, Storage, Realtime, pg_cron
- **Data:** TanStack Query + `createServerFn` RPC
- **Offline:** `vite-plugin-pwa` + IndexedDB (`idb-keyval`)
- **Runtime target:** Node 20+ or Cloudflare Workers (with `nodejs_compat`)

### Repo Layout
```
src/
  routes/                TanStack file-based routes
    _authenticated/      Protected pages (dashboard, products, orders, ...)
    api/public/          HTTP endpoints (webhooks, cron)
    auth.tsx             Login / signup
    __root.tsx           Root shell
  integrations/supabase/ Auto-generated Supabase clients (browser + admin)
  lib/                   Server functions (*.functions.ts), helpers, PDF, exporters
  components/            UI (shadcn) and ERP-specific components
  hooks/                 useAuth, useRealtime, etc.
supabase/
  migrations/            All schema, RLS, functions, triggers (apply in order)
  config.toml            Supabase project ref (REPLACE with your own ref)
public/                  Static assets, manifest, icons
docs/USER_MANUAL.md      End-user documentation
vite.config.ts           Vite + PWA + env injection
```

---

## 2. Prerequisites

- **Bun ≥ 1.1** (`curl -fsSL https://bun.sh/install | bash`)
- **Node 20+** (for tooling compatibility)
- **Supabase CLI** (`brew install supabase/tap/supabase` or see https://supabase.com/docs/guides/cli)
- A **Supabase project** (free tier is fine to start): https://supabase.com/dashboard
- Optional: **Resend** account for daily email reports

---

## 3. Create Your Own Supabase Project

1. Go to https://supabase.com/dashboard → **New project**.
2. Copy these values from **Project Settings → API**:
   - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **Project Ref** (the subdomain, e.g. `abcdwxyz`) → `VITE_SUPABASE_PROJECT_ID`
   - **anon / publishable key** → `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server-only, NEVER ship to browser)
3. From **Project Settings → Database**, copy the **Connection string** (URI) for the CLI.

### Replace the Lovable project ref

Edit `supabase/config.toml`:

```toml
project_id = "YOUR_NEW_SUPABASE_REF"
```

---

## 4. Environment Variables

Create `.env` in the project root (use `.env.example` as a base):

```ini
# --- Client (Vite, public, bundled into JS) ---
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...   # anon key
VITE_SUPABASE_PROJECT_ID=YOUR_REF

# --- Server-only (NEVER commit, NEVER prefix with VITE_) ---
SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...         # same anon key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...        # service_role — admin, bypasses RLS
PEPPER_SECRET=                                  # random 64+ char string (see below)

# --- Optional ---
RESEND_API_KEY=                                 # for daily report emails
REPORT_RECIPIENTS=ops@example.com,founder@example.com
LOVABLE_API_KEY=                                # only if you keep using Lovable AI Gateway
```

Generate a strong pepper:
```bash
openssl rand -base64 64
```

> **⚠️ Important** — `PEPPER_SECRET` is mixed into every password hash. If you
> change it after users sign up, **all existing passwords break**. Pick once, back it up.

### Removing the Lovable fallback (recommended after migration)

`vite.config.ts` currently contains hard-coded fallback values that point to the
old Lovable Cloud Supabase project. After you've set your own `.env`, delete
those fallbacks so accidental misconfiguration fails loudly instead of silently
talking to the wrong database:

```ts
// vite.config.ts — replace the define block with:
define: {
  "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL),
  "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(process.env.VITE_SUPABASE_PROJECT_ID),
},
```

---

## 5. Apply the Database Schema

All schema lives in `supabase/migrations/` (timestamps preserved). Apply with the Supabase CLI:

```bash
supabase login                       # browser auth, one-time
supabase link --project-ref YOUR_REF
supabase db push                     # applies every migration in order
```

This creates:

### Tables (all in `public` schema, RLS enabled)
| Table | Purpose |
| --- | --- |
| `profiles` | User profile + role mirror (auto-created on signup via trigger) |
| `user_roles` | Enum-based role table (`admin`, `staff`) used by `has_role()` |
| `products` | Catalog with SKU, price, stock, image URL |
| `categories` | Product categories |
| `inventory` | Per-warehouse stock levels |
| `warehouses` | Physical/logical stock locations |
| `inventory_transfers` | Atomic warehouse-to-warehouse moves |
| `breakage_logs` | Damage / write-off records |
| `customers` | CRM contacts |
| `orders` + `order_items` | Sales orders and line items |
| `coupons` | Promotions |
| `settings` | App-wide key/value settings |
| `audit_logs` | Immutable diff log written by trigger |
| `auth_attempts` + `blocked_ips` | Brute-force protection |

### Database functions
- `handle_new_user()` — trigger that runs on `auth.users` INSERT. First signup becomes **Super Admin**, all others become **Cashier**.
- `has_role(uuid, app_role)` / `staff_has_role(text[])` — `SECURITY DEFINER` helpers used by RLS.
- `write_audit_log()` — generic trigger writing before/after JSON to `audit_logs`.
- `touch_updated_at()` — `updated_at` maintenance trigger.

### Storage
A bucket named **`product-images`** (private) is used for product photos. Create it from the Supabase dashboard → Storage, or via SQL:
```sql
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', false);
```
Add policies allowing authenticated users to read/write their own product images.

### Realtime
Already enabled in migrations for `orders`, `inventory`, `inventory_transfers`. Verify under **Database → Replication**.

### pg_cron daily report
Create the cron job in the SQL editor (replace `<HOST>` and `<ANON_KEY>`):
```sql
select cron.schedule(
  'erp-daily-report',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://<HOST>/api/public/hooks/daily-report',
    headers := jsonb_build_object('apikey', '<ANON_KEY>', 'Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);
```

---

## 6. Configure Auth Providers

In **Supabase Dashboard → Authentication → Providers**:

1. **Email** — enable. Set "Confirm email" to your preference.
2. **Google** (optional) — enable, paste Google OAuth client ID + secret. Add the redirect URL shown by Supabase to your Google Cloud OAuth consent screen.

In **Authentication → URL Configuration**:
- **Site URL** = your production URL (e.g. `https://erp.example.com`)
- **Redirect URLs** = add `http://localhost:5173`, `http://localhost:3000`, and your production domain.

> The original Lovable build wrapped Google sign-in in a Lovable broker. After
> migration, the code path falls back to standard `supabase.auth.signInWithOAuth`.
> If you keep the broker call, also keep `LOVABLE_API_KEY` set; otherwise replace
> the broker call site with `supabase.auth.signInWithOAuth({ provider: 'google' })`.

---

## 7. Install & Run Locally

```bash
bun install
bun run dev          # → http://localhost:5173
```

Build / preview:
```bash
bun run build
bun run preview
```

**First signup becomes Super Admin** (enforced by `handle_new_user` trigger).
Sign up, then promote additional users from **Personnel** in the sidebar.

---

## 8. Deploy Online (outside Lovable)

The app is a standard TanStack Start v1 project, so any host that can run a
Node/Edge SSR server works. Pick one:

### Option A — Vercel (easiest)
1. Push the repo to GitHub / GitLab.
2. Import on Vercel. Framework preset: **Other** (Vite). Build command: `bun run build`. Install command: `bun install`. Output dir: leave default.
3. Add **every** env var from section 4 in Vercel → Project Settings → Environment Variables (Production + Preview).
4. Deploy. Update Supabase **Site URL** + **Redirect URLs** to the Vercel URL.

### Option B — Cloudflare Workers
TanStack Start ships a Workers-compatible build.
```bash
bun add -d wrangler
bunx wrangler deploy
```
Configure secrets with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` etc.
Make sure `compatibility_flags = ["nodejs_compat"]` is set in `wrangler.toml`.

### Option C — Netlify
Build command `bun run build`, publish dir `dist/`, install command `bun install`. Add env vars in Site settings.

### Option D — VPS / Docker
```bash
bun run build
PORT=3000 node .output/server/index.mjs    # exact entry path depends on adapter
```
Put behind nginx + a TLS cert (Caddy or certbot).

### After deploy — checklist
- [ ] Supabase Site URL + Redirect URLs include the new domain
- [ ] Google OAuth authorized redirect URIs include `https://<your-host>/auth/v1/callback`
- [ ] pg_cron job points at the new public URL
- [ ] Resend (or other email provider) is verified for your sending domain
- [ ] Storage bucket `product-images` exists with the correct policies
- [ ] You removed the Lovable fallback values from `vite.config.ts` (section 4)

---

## 9. Secrets Inventory (full list)

| Name | Where used | Required? | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser bundle | ✅ | Public, bundled. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser bundle | ✅ | Anon key. Public. |
| `VITE_SUPABASE_PROJECT_ID` | Browser bundle | ✅ | Just the ref. |
| `SUPABASE_URL` | Server functions | ✅ | Same value as VITE_ counterpart. |
| `SUPABASE_PUBLISHABLE_KEY` | Server functions, `/api/public/hooks/daily-report` apikey gate | ✅ | Anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts` admin client | ✅ | **Server only.** Bypasses RLS. |
| `PEPPER_SECRET` | `src/lib/security.functions.ts` | ✅ | 64+ random bytes. Do not rotate after users sign up. |
| `RESEND_API_KEY` | Daily report email | optional | If absent, the cron job runs but skips sending email. |
| `REPORT_RECIPIENTS` | Daily report email | optional | Comma-separated. |
| `LOVABLE_API_KEY` | Lovable AI Gateway calls | optional | Remove if you stop using Lovable AI. |

---

## 10. Code Changes Already Applied vs Original Lovable Template

If you compare to a vanilla Lovable export, the following project-specific
changes have already been made and are baked into this zip:

1. **`vite.config.ts`** — added a `define` block that injects
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID`
   at build time, with hard-coded Lovable fallbacks. **Replace those fallbacks
   with your own values, or delete them** (see section 4).
2. **`src/lib/supabase-config.ts`** — `hasSupabaseBrowserConfig()` helper used
   by the root route and the `_authenticated` gate to redirect to `/auth` when
   env vars are missing instead of crashing SSR with a blank screen.
3. **`src/routes/__root.tsx`** — only subscribes to `supabase.auth.onAuthStateChange`
   when `hasSupabaseBrowserConfig()` is true; adds an error boundary.
4. **`src/routes/_authenticated/route.tsx`** — `ssr: false` + `beforeLoad` redirect
   to `/auth` when not signed in.
5. **`src/routes/_authenticated/audit-log.tsx`** — waits for both session AND
   profile to load before deciding access (prevents premature redirect for admins).
6. **`src/integrations/supabase/*`** — kept as auto-generated files. Safe to edit
   manually now that you're off Lovable, but the existing shape works.

---

## 11. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing Supabase environment variable(s)` at login | `.env` not loaded. Restart dev server. In prod, set env vars in your host's dashboard. |
| `Unauthorized: provider is not enabled` on Google sign-in | Enable Google provider in Supabase → Authentication → Providers. |
| Blank screen / SSR error after deploy | Check the host's function logs. Usually a missing server-only env var (`SUPABASE_SERVICE_ROLE_KEY` or `PEPPER_SECRET`). |
| `permission denied for table xyz` | A new table was added without `GRANT`s. Add `GRANT ... TO authenticated;` in a new migration. |
| Audit log page redirects to dashboard | You're not Super Admin. Promote your account from **Personnel**, or update `profiles.role` directly in SQL. |
| Daily report cron returns 401 | The `apikey` header must equal your `SUPABASE_PUBLISHABLE_KEY`. Re-create the cron job with the correct value. |

---

## 12. License

Proprietary — all rights reserved. Update this section to match your distribution model.

---

**You now own the whole stack.** Back up your `PEPPER_SECRET`, take regular
Postgres dumps (`supabase db dump -f backup.sql`), and you're free of any
Lovable dependency. Good luck. 🚀
