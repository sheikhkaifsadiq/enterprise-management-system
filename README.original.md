# ERP System

A modern, offline-capable ERP for retail and small-to-mid businesses. Built on TanStack Start, React 19, Tailwind v4, and Lovable Cloud (Supabase). Covers POS, inventory, multi-warehouse logistics, CRM, analytics, audit logging, and automated daily reporting.

## Features

- **Authentication & Roles** — Email/password + Google OAuth, salted+peppered password hashing, brute-force lockout, 2FA scaffolding. Roles: Super Admin, Admin, Manager, Cashier.
- **Catalog & Inventory** — Products with images (Supabase Storage), categories, barcode/QR generation, CSV bulk import, low-stock tracking, damage logs.
- **Multi-Warehouse** — Warehouses + atomic stock transfers with full audit trail.
- **Sales & POS** — Checkout (POS) with promotions, customers, orders, PDF invoices.
- **Analytics** — YoY KPIs, multi-select filters, Excel/PDF exports, server-side pagination.
- **Realtime** — Postgres change subscriptions auto-refresh orders, inventory, transfers.
- **Audit Log** — Immutable JSON diffs of every change to core tables (admin-only).
- **Offline / PWA** — Service worker, cached product list, queued POS orders that auto-sync when back online.
- **Daily Reports** — pg_cron-scheduled report (06:00 UTC) with optional Resend email dispatch.

## Tech Stack

- **Framework:** TanStack Start v1 (React 19, Vite 7, SSR on Cloudflare Workers)
- **Styling:** Tailwind CSS v4 + shadcn/ui + Framer Motion
- **Backend:** Lovable Cloud (Supabase) — Postgres, Auth, Storage, Realtime, pg_cron
- **Data:** TanStack Query + `createServerFn` RPC
- **Offline:** vite-plugin-pwa + IndexedDB (idb-keyval)

## Installation

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.1
- Node 20+ (for tooling compatibility)
- A Lovable Cloud project, **or** a self-hosted Supabase project

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd <your-repo>
bun install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your Supabase URL + publishable key
```

### 3. Apply Database Migrations
All schema lives in `supabase/migrations/`. Apply via the Supabase CLI:
```bash
supabase link --project-ref <your-ref>
supabase db push
```
> On Lovable, migrations are applied automatically — no manual step needed.

### 4. Server-Side Secrets
Set in Lovable Cloud → Secrets (or your Supabase dashboard → Edge Function Secrets):

| Secret | Purpose |
| --- | --- |
| `PEPPER_SECRET` | Extra entropy added to password hashes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin operations |
| `LOVABLE_API_KEY` | Lovable AI Gateway (optional) |
| `RESEND_API_KEY` | Daily report emails (optional) |
| `REPORT_RECIPIENTS` | Comma-separated email list for reports (optional) |

### 5. Run
```bash
bun run dev      # http://localhost:5173
bun run build    # production build
```

## First-Run

The **first user to sign up becomes the Super Admin automatically.** Subsequent signups default to Cashier; promote from **Personnel** (admin only).

## Security

- `.env` and all key files are gitignored.
- Server secrets are read via `process.env` inside server functions only — never bundled to the client.
- Row-Level Security (RLS) policies guard every table.
- Roles stored in a dedicated `user_roles` table with a `SECURITY DEFINER` `has_role()` function (no recursive RLS).
- Audit triggers log every INSERT/UPDATE/DELETE on core tables.

**Never commit `.env`, service-role keys, or `PEPPER_SECRET`.** They belong in Lovable Cloud Secrets or your secret manager.

## Documentation

- [User Manual](./docs/USER_MANUAL.md) — end-user guide for every module
- [Lovable Docs](https://docs.lovable.dev) — platform docs

## License

Proprietary — all rights reserved. Update this section to match your distribution model.
