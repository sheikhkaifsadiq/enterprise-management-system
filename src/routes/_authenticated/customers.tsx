import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/erp/AppShell";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { formatPKR, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — ERP System" }] }),
  component: CustomersPage,
});

type Customer = { id: number; fullname: string; email: string | null; phone: string | null; address: string | null; username: string | null; created_at: string };

function CustomersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Customer | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<Customer> & { id?: number }) => {
      // 1:1 port: auto-generate username from email if creating
      const payload = {
        fullname: input.fullname ?? "", email: input.email || null,
        phone: input.phone || null, address: input.address || null,
        username: input.id ? input.username ?? null : (input.email ? `${input.email.split("@")[0]}${Math.floor(Math.random() * 1000)}` : `user_${Date.now()}`),
      };
      if (input.id) {
        const { error } = await supabase.from("customers").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Customer record synchronized" : "Customer onboarded"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const editorOpen = open || !!editing;
  const e = editing;

  return (
    <AppShell
      title="CRM Directory"
      description="Master registry of high-value showroom customers and contact history."
      actions={
        <Dialog open={editorOpen} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Onboard Customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{e ? `Edit ${e.fullname}` : "Premium Customer Onboarding"}</DialogTitle></DialogHeader>
            <form onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              upsert.mutate({
                fullname: String(fd.get("fullname")), email: String(fd.get("email") ?? ""),
                phone: String(fd.get("phone") ?? ""), address: String(fd.get("address") ?? ""),
                ...(e ? { id: e.id, username: e.username } : {}),
              });
            }} className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Full Name</Label><Input name="fullname" defaultValue={e?.fullname} required /></div>
              <div><Label>Email</Label><Input name="email" type="email" defaultValue={e?.email ?? ""} /></div>
              <div><Label>Phone</Label><Input name="phone" defaultValue={e?.phone ?? ""} /></div>
              <div className="col-span-2"><Label>Address</Label><Input name="address" defaultValue={e?.address ?? ""} /></div>
              <DialogFooter className="col-span-2"><Button type="submit" disabled={upsert.isPending}>{upsert.isPending ? "Synchronizing…" : "Save"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? <TableSkeleton rows={8} cols={6} /> : (
          <table className="erp-table">
            <thead><tr>
              <th className="erp-th">Name</th><th className="erp-th">Email</th><th className="erp-th">Phone</th>
              <th className="erp-th">Address</th><th className="erp-th">Joined</th><th className="erp-th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="erp-row-hover">
                  <td className="erp-td font-medium">{c.fullname}</td>
                  <td className="erp-td text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="erp-td text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="erp-td text-muted-foreground">{c.address ?? "—"}</td>
                  <td className="erp-td text-muted-foreground">{formatDateTime(c.created_at)}</td>
                  <td className="erp-td text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistory(c)}><HistoryIcon className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="erp-td text-center text-muted-foreground">No customers in directory.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Transaction History — {history?.fullname}</DialogTitle></DialogHeader>
          {history && <CustomerHistory customerId={history.id} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CustomerHistory({ customerId }: { customerId: number }) {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["customer-history", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,final_amount,created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const ltv = orders.reduce((s, o) => s + Number(o.final_amount), 0);
  return (
    <div>
      <div className="mb-3 rounded-md bg-secondary p-3 text-[13px]">Lifetime Value: <span className="font-bold">{formatPKR(ltv)}</span> · {orders.length} orders</div>
      {isLoading ? <TableSkeleton rows={5} cols={4} /> : (
        <table className="erp-table">
          <thead><tr><th className="erp-th">Order #</th><th className="erp-th">Date</th><th className="erp-th">Status</th><th className="erp-th text-right">Amount</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="erp-row-hover">
                <td className="erp-td font-mono text-[12px]">OR-{o.id}</td>
                <td className="erp-td text-muted-foreground">{formatDateTime(o.created_at)}</td>
                <td className="erp-td">{o.status}</td>
                <td className="erp-td text-right tabular-nums">{formatPKR(o.final_amount)}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={4} className="erp-td text-center text-muted-foreground">No transaction history.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
