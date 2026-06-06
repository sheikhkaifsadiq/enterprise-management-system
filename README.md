# Enterprise Resource Planning System

**Live Preview:** [https://kaif-erp.vercel.app/](https://kaif-erp.vercel.app/)

A modern, high-density ERP system designed for retail and logistics operations. Built to handle point-of-sale (POS), multi-warehouse inventory, CRM, financial analytics, and comprehensive audit logging.

## Tech Stack

- **Frontend:** React 19, Tailwind CSS v4, Radix UI Primitives
- **Framework:** Vite + TanStack Start & Router
- **Backend Infrastructure:** Supabase (PostgreSQL, Auth, Edge Functions)
- **Deployment:** Optimized for Vercel (Native Edge Function support)

## Key Features

1. **POS & Order Management**
   - Streamlined checkout flow with barcode scanning support.
   - Real-time cart calculation, discount applications, and split payments.
2. **Multi-Warehouse Logistics**
   - Track inventory across distinct warehouse locations.
   - Execute and audit stock transfers with conflict-free ledger tracking.
3. **Advanced Analytics Dashboard**
   - Real-time revenue insights, moving averages, and top-selling categories.
   - PDF exports and CSV downloads for offline reporting.
4. **Role-Based Access Control (RBAC)**
   - Granular permissions separating Admins from standard Staff.
   - Secure server-side validation of all state mutations.

## Getting Started

### 1. Environment Setup

Create a `.env` file at the root of the project with your Supabase credentials:

```bash
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key

SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
PEPPER_SECRET=your-secure-pepper-string
RESEND_API_KEY=your-resend-api-key # Optional: For daily report emails
REPORT_RECIPIENTS=admin@example.com
```

### 2. Local Development

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

### 3. Production Deployment

This project is fully configured for Vercel.

1. Connect your GitHub repository to Vercel.
2. Set the **Framework Preset** to `TanStack Start` (or let Vercel auto-detect).
3. Ensure all environment variables from your `.env` are added to Vercel's Environment Variables settings.
4. Deploy. The custom build configuration natively generates the required `.vercel/output` edge structure.

## Architecture & Security

- **Server-Side Security:** Sensitive operations (like fetching daily reports or managing user roles) are securely gated behind server functions that verify the caller's IP, rate limit requests, and validate Supabase JWTs.
- **Error Boundaries:** The application implements robust React Error Boundaries combined with a custom telemetry reporter for unhandled exceptions.
- **PWA Ready:** The system operates offline via a registered Service Worker caching essential static assets.

## License & Copyright

**© 2026 Sheikh Kaif Sadiq. All Rights Reserved.**

This repository and its source code are strictly proprietary and confidential. No part of this repository may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the owner. You may view the code for educational purposes, but you may not copy, fork, modify, or use it for any commercial or personal project.

---
*Developed by Sheikh Kaif Sadiq*
