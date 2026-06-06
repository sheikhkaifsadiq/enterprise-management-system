# ERP User Manual

Welcome! This guide walks you through every module in the ERP system.

---

## 1. Getting Started

### Sign Up / Sign In
1. Open the app — you land on the **Auth** page.
2. **First user**: register with email + password (or Google). You'll automatically become **Super Admin**.
3. **Subsequent users**: sign up (defaults to **Cashier**), then have an admin promote you in **Personnel**.

### Roles & Permissions
| Role | Can Do |
| --- | --- |
| **Super Admin** | Everything, including Personnel, Audit Log, Security, System Config |
| **Admin** | Same as Super Admin except managing other admins |
| **Manager** | Manage products, inventory, transfers, orders, promotions |
| **Cashier** | Run POS checkout, view orders/customers |

---

## 2. Dashboard
Landing page with today's revenue, order count, low-stock alerts, and quick links.

## 3. Analytics
- Filter by date range, category, warehouse, status.
- View YoY comparisons and trend charts.
- Export to **Excel** or **PDF** from the toolbar.

## 4. Products
- **Add Product**: name, SKU, price, category, image upload, stock.
- **Bulk Import**: upload a CSV — template downloadable from the import dialog.
- **Barcode / QR**: auto-generated per product; print from the product detail view.

## 5. Categories
Create a hierarchy of product categories. Drag to reorder.

## 6. Stock Control (Inventory)
- View live stock per warehouse.
- Adjust quantities with a reason note (logged to the audit trail).
- Low-stock items are highlighted red.

## 7. Warehouses
Manage physical locations. Each warehouse holds its own inventory.

## 8. Transfers
Move stock between warehouses:
1. Pick **Source** and **Destination** warehouses.
2. Add line items + quantities.
3. Submit — the system atomically debits source and credits destination.

## 9. Damage Logs
Record breakage / spoilage. Deducts from stock and shows in analytics.

## 10. Orders
- Browse, filter, and search all orders.
- Status: Pending → Paid → Fulfilled / Cancelled.
- Open an order to print/download a **PDF invoice**.
- Updates appear in real time (no refresh needed).

## 11. Checkout (POS)
1. Scan / search a product → it's added to the cart.
2. Apply a promotion code (optional).
3. Pick the customer (or "Walk-in").
4. **Authorize Order**.

**Offline mode**: if you lose connection, the banner turns orange and the button becomes **"Queue Order Offline"**. Orders are stored locally (IndexedDB) and auto-sync when you're back online.

## 12. Promotions
Create percentage or fixed-amount discounts, optionally limited by date or product.

## 13. Customers
CRM with order history, lifetime value, and contact info.

## 14. My Profile
Update name, phone, profile picture, password. Toggle 2FA.

---

## Administration (Admins only)

### 15. Personnel
Invite staff, change roles, deactivate accounts.

### 16. Audit Log
Read-only, immutable log of every change to orders, products, inventory, transfers, warehouses. Filter by entity, user, or ID.

### 17. Security
- Toggle leaked-password protection (HIBP).
- Configure session timeouts.
- Manage brute-force lockout policy.

### 18. System Config
Tax rate, currency, business info shown on invoices, daily-report recipients.

---

## Install as an App (PWA)
On **Chrome / Edge / Safari**:
1. Open the app in your browser.
2. Click the **Install** icon in the address bar (or *Share → Add to Home Screen* on iOS).
3. Launch from your desktop / home screen — works offline.

## Daily Reports
Each day at **06:00 UTC**, the system aggregates the previous 24h KPIs (orders, revenue, pending, low stock, transfers). If Resend is configured in System Config, a summary email is sent to recipients.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Can't log in | Check email/password; ensure your account isn't locked (5 failed attempts = 15 min lockout). |
| Orders not syncing | Check the offline banner — once green, queued orders flush automatically. |
| Image upload fails | Max 5 MB, formats: JPG/PNG/WebP. |
| Stock count looks wrong | Open **Audit Log** and filter by the product ID to see every change. |

For more help, contact your administrator or open an issue in the GitHub repo.
