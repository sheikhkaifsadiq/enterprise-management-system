import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/erp/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";
import { formatPKR, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/discounts")({
  head: () => ({ meta: [{ title: "Promotions — ERP System" }] }),
  component: DiscountsPage,
});

type Coupon = { id: number; code: string; type: string; value: number; min_purchase: number; status: string; created_at: string };

function DiscountsPage() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  const add = useMutation({
    mutationFn: async (input: { code: string; type: string; value: number; min_purchase: number }) => {
      const { error } = await supabase.from("coupons").insert({ ...input, code: input.code.toUpperCase(), status: "Active" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Promotion deployed"); setOpen(false); qc.invalidateQueries({ queryKey: ["coupons"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Promotion terminated"); qc.invalidateQueries({ queryKey: ["coupons"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <AppShell
      title="Promotion Engine"
      description="Tiered coupon tokens and markdown protocols."
      actions={isManager && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />New Promotion</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Initialize Promotion Protocol</DialogTitle></DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              add.mutate({
                code: String(fd.get("code")), type: String(fd.get("type")),
                value: Number(fd.get("value")), min_purchase: Number(fd.get("min_purchase") || 0),
              });
            }} className="space-y-3">
              <div><Label>Code (UPPERCASE)</Label><Input name="code" required style={{ textTransform: "uppercase" }} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label>
                  <Select name="type" defaultValue="percentage"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="percentage">Percentage (%)</SelectItem><SelectItem value="fixed">Fixed (Rs.)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Value</Label><Input name="value" type="number" step="0.01" required /></div>
              </div>
              <div><Label>Min Purchase</Label><Input name="min_purchase" type="number" step="0.01" defaultValue="0" /></div>
              <DialogFooter><Button type="submit" disabled={add.isPending}>{add.isPending ? "Deploying…" : "Deploy"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="erp-table">
          <thead><tr>
            <th className="erp-th">Code</th><th className="erp-th">Type</th><th className="erp-th text-right">Value</th>
            <th className="erp-th text-right">Min Purchase</th><th className="erp-th">Status</th><th className="erp-th">Created</th>
            {isManager && <th className="erp-th text-right">Actions</th>}
          </tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="erp-row-hover">
                <td className="erp-td font-mono font-bold">{c.code}</td>
                <td className="erp-td capitalize">{c.type}</td>
                <td className="erp-td text-right tabular-nums">{c.type === "percentage" ? `${c.value}%` : formatPKR(c.value)}</td>
                <td className="erp-td text-right tabular-nums">{formatPKR(c.min_purchase)}</td>
                <td className="erp-td"><Badge variant={c.status === "Active" ? "default" : "secondary"}>{c.status}</Badge></td>
                <td className="erp-td text-muted-foreground">{formatDateTime(c.created_at)}</td>
                {isManager && <td className="erp-td text-right"><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="erp-td text-center text-muted-foreground">No promotions configured.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
