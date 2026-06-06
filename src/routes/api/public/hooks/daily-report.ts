// Cron-friendly daily ERP report. Bypasses auth (under /api/public/*) but verifies the Supabase
// anon key in the apikey header, queries yesterday's KPIs via the service role, and (if a Resend
// connection is configured) emails a summary to the report recipients.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/daily-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

        const [{ data: orders }, { data: lowStock }, { data: transfers }] = await Promise.all([
          supabaseAdmin.from("orders").select("id, final_amount, status, created_at").gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
          supabaseAdmin.from("products").select("id,name,stock_count").lt("stock_count", 10).eq("is_archived", false).order("stock_count", { ascending: true }).limit(10),
          supabaseAdmin.from("inventory_transfers").select("id").gte("created_at", start.toISOString()),
        ]);

        const totalOrders = orders?.length ?? 0;
        const totalRevenue = (orders ?? []).reduce((s, o) => s + Number(o.final_amount ?? 0), 0);
        const pending = (orders ?? []).filter((o) => o.status === "Pending").length;

        const report = {
          window: { from: start.toISOString(), to: end.toISOString() },
          kpis: {
            orders: totalOrders,
            revenue: totalRevenue,
            pending_orders: pending,
            transfers_logged: transfers?.length ?? 0,
          },
          low_stock: (lowStock ?? []).map((p) => ({ id: p.id, name: p.name, stock: Number(p.stock_count) })),
          generated_at: new Date().toISOString(),
        };

        // Optional: email via Resend connector if configured
        // Optional: email via Resend if configured
        const resendKey = process.env.RESEND_API_KEY;
        const recipients = (process.env.REPORT_RECIPIENTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

        let emailStatus: "skipped" | "sent" | "failed" = "skipped";
        let emailError: string | undefined;
        if (resendKey && recipients.length > 0) {
          try {
            const html = `
              <h2 style="font-family:system-ui;margin:0 0 8px">ERP Daily Report</h2>
              <p style="color:#475569;margin:0 0 16px;font-family:system-ui">Last 24 hours · ${start.toISOString()} → ${end.toISOString()}</p>
              <table style="border-collapse:collapse;font-family:system-ui;font-size:13px">
                <tr><td style="padding:6px 12px;color:#475569">Orders</td><td style="padding:6px 12px;font-weight:600">${totalOrders}</td></tr>
                <tr><td style="padding:6px 12px;color:#475569">Revenue</td><td style="padding:6px 12px;font-weight:600">PKR ${totalRevenue.toFixed(2)}</td></tr>
                <tr><td style="padding:6px 12px;color:#475569">Pending</td><td style="padding:6px 12px;font-weight:600">${pending}</td></tr>
                <tr><td style="padding:6px 12px;color:#475569">Transfers</td><td style="padding:6px 12px;font-weight:600">${transfers?.length ?? 0}</td></tr>
              </table>
              <h3 style="font-family:system-ui;margin:20px 0 6px">Low stock (&lt; 10)</h3>
              <ul style="font-family:system-ui;font-size:13px;color:#334155">
                ${(report.low_stock.map((p) => `<li>${p.name} — ${p.stock}</li>`).join("") || "<li>None 🎉</li>")}
              </ul>`;
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendKey}`,
              },
              body: JSON.stringify({
                from: "ERP Reports <onboarding@resend.dev>",
                to: recipients,
                subject: `ERP Daily Report — ${totalOrders} orders · PKR ${totalRevenue.toFixed(0)}`,
                html,
              }),
            });
            if (!resp.ok) { emailStatus = "failed"; emailError = `${resp.status} ${await resp.text()}`; }
            else emailStatus = "sent";
          } catch (e) {
            emailStatus = "failed";
            emailError = e instanceof Error ? e.message : String(e);
          }
        }

        return new Response(JSON.stringify({ ok: true, report, email: { status: emailStatus, error: emailError, recipients: recipients.length } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
