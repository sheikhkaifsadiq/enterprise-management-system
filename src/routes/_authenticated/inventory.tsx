import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, AlertOctagon, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import Papa from "papaparse";
import { AppShell } from "@/components/erp/AppShell";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Stock Control — ERP System" }] }),
  component: InventoryPage,
});

type Batch = {
  id: number; product_id: number; batch_id: string | null; stock_count: number; updated_at: string;
  product_name: string; category: string | null; unit: string; low_stock_threshold: number;
};

function InventoryPage() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [damage, setDamage] = useState<Batch | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  useRealtime("rt-inventory", "inventory", [["inventory"]]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("id,product_id,batch_id,stock_count,updated_at,product:products(name,category,unit,low_stock_threshold)")
        .order("stock_count", { ascending: true });
      if (error) throw error;
      type Row = {
        id: number; product_id: number; batch_id: string | null; stock_count: number; updated_at: string;
        product: { name: string; category: string | null; unit: string; low_stock_threshold: number } | null;
      };
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id, product_id: r.product_id, batch_id: r.batch_id,
        stock_count: r.stock_count, updated_at: r.updated_at,
        product_name: r.product?.name ?? "—", category: r.product?.category ?? null,
        unit: r.product?.unit ?? "", low_stock_threshold: r.product?.low_stock_threshold ?? 0,
      })) as Batch[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name").eq("is_archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const addBatch = useMutation({
    mutationFn: async (input: { product_id: number; batch_id: string; stock_count: number }) => {
      const { error: e1 } = await supabase.from("inventory").insert(input);
      if (e1) throw e1;
      // Sync products.stock_count += stock_count
      const { data: cur } = await supabase.from("products").select("stock_count").eq("id", input.product_id).single();
      const newCount = Number(cur?.stock_count ?? 0) + Number(input.stock_count);
      const { error: e2 } = await supabase.from("products").update({ stock_count: newCount }).eq("id", input.product_id);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Batch registered"); setAddOpen(false); qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const logBreakage = useMutation({
    // 1:1 port of inventoryController.logBreakage (Postgres txn → sequential supabase calls)
    mutationFn: async (input: { inventory_id: number; product_id: number; quantity: number; reason: string }) => {
      const parsed = z.object({
        inventory_id: z.number(),
        product_id: z.number(),
        quantity: z.coerce.number().min(0.01),
        reason: z.string().min(1).max(500),
      }).parse(input);

      // 1. Deduct from inventory batch (guard against negative)
      const { data: invRow, error: invErr } = await supabase
        .from("inventory").select("stock_count").eq("id", parsed.inventory_id).single();
      if (invErr) throw invErr;
      if (Number(invRow.stock_count) < parsed.quantity) throw new Error("Insufficient stock in batch.");
      const newBatch = Number(invRow.stock_count) - parsed.quantity;
      const { error: u1 } = await supabase.from("inventory").update({ stock_count: newBatch }).eq("id", parsed.inventory_id);
      if (u1) throw u1;

      // 2. Sync products.stock_count
      const { data: prodRow, error: prodErr } = await supabase.from("products").select("stock_count").eq("id", parsed.product_id).single();
      if (prodErr) throw prodErr;
      const newProd = Number(prodRow.stock_count) - parsed.quantity;
      const { error: u2 } = await supabase.from("products").update({ stock_count: newProd }).eq("id", parsed.product_id);
      if (u2) throw u2;

      // 3. Audit
      const { data: u } = await supabase.auth.getUser();
      const { error: u3 } = await supabase.from("breakage_logs").insert({
        inventory_id: parsed.inventory_id, product_id: parsed.product_id,
        staff_id: u.user?.id ?? null, quantity: parsed.quantity, reason: parsed.reason,
      });
      if (u3) throw u3;
    },
    onSuccess: () => { toast.success("Asset damage protocol complete"); setDamage(null); qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["breakage"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  async function handleCsvImport(file: File) {
    setImporting(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const RowSchema = z.object({
          product_name: z.string().trim().min(1),
          batch_id: z.string().trim().optional().default(""),
          stock_count: z.coerce.number().min(0),
        });
        let ok = 0, skipped = 0;
        // Build name → id lookup
        const nameById = new Map(products.map((p) => [p.name.toLowerCase(), p.id]));
        for (const raw of res.data) {
          const parsed = RowSchema.safeParse(raw);
          if (!parsed.success) { skipped++; continue; }
          const pid = nameById.get(parsed.data.product_name.toLowerCase());
          if (!pid) { skipped++; continue; }
          try {
            await addBatch.mutateAsync({
              product_id: pid, batch_id: parsed.data.batch_id, stock_count: parsed.data.stock_count,
            });
            ok++;
          } catch { skipped++; }
        }
        setImporting(false);
        if (csvInputRef.current) csvInputRef.current.value = "";
        toast.success(`Imported ${ok} batch${ok === 1 ? "" : "es"}${skipped ? ` · ${skipped} skipped` : ""}`);
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["products"] });
      },
      error: (err) => { setImporting(false); toast.error(`CSV parse failed: ${err.message}`); },
    });
  }

  function downloadCsvTemplate() {
    const csv = "product_name,batch_id,stock_count\nSample Tile 60x60,BATCH-001,50\nSample Tile 60x60,BATCH-002,75\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "inventory-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Stock Control"
      description="Batch-level inventory with breakage protocols and real-time depletion."
      actions={isManager && (
        <>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvImport(f); }} />
          <Button variant="outline" size="sm" onClick={downloadCsvTemplate}><Download className="mr-1.5 h-3.5 w-3.5" />Template</Button>
          <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />{importing ? "Importing…" : "Import CSV"}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Register Batch</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register Inventory Batch</DialogTitle></DialogHeader>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                addBatch.mutate({
                  product_id: Number(fd.get("product_id")),
                  batch_id: String(fd.get("batch_id") ?? ""),
                  stock_count: Number(fd.get("stock_count") ?? 0),
                });
              }} className="space-y-3">
                <div><Label>Product</Label>
                  <Select name="product_id">
                    <SelectTrigger><SelectValue placeholder="Select asset…" /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Batch ID</Label><Input name="batch_id" /></div>
                <div><Label>Stock Count</Label><Input name="stock_count" type="number" step="0.01" required /></div>
                <DialogFooter><Button type="submit" disabled={addBatch.isPending}>{addBatch.isPending ? "Registering…" : "Register"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? <TableSkeleton rows={8} cols={6} /> : (
          <table className="erp-table">
            <thead><tr>
              <th className="erp-th">Product</th><th className="erp-th">Category</th>
              <th className="erp-th">Batch</th><th className="erp-th text-right">Stock</th>
              <th className="erp-th">Last Updated</th>{isManager && <th className="erp-th text-right">Actions</th>}
            </tr></thead>
            <tbody>
              {rows.map((b) => {
                const low = Number(b.stock_count) <= Number(b.low_stock_threshold);
                return (
                  <tr key={b.id} className="erp-row-hover">
                    <td className="erp-td font-medium">{b.product_name}</td>
                    <td className="erp-td text-muted-foreground">{b.category ?? "—"}</td>
                    <td className="erp-td font-mono text-[11px] text-muted-foreground">{b.batch_id ?? "—"}</td>
                    <td className={`erp-td text-right tabular-nums font-medium ${low ? "text-amber-600" : ""}`}>{b.stock_count} {b.unit}</td>
                    <td className="erp-td text-muted-foreground">{new Date(b.updated_at).toLocaleString()}</td>
                    {isManager && <td className="erp-td text-right">
                      <Button variant="outline" size="sm" onClick={() => setDamage(b)} className="h-7"><AlertOctagon className="mr-1 h-3.5 w-3.5" />Log Damage</Button>
                    </td>}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="erp-td text-center text-muted-foreground">No batches registered.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!damage} onOpenChange={(o) => !o && setDamage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Asset Damage — {damage?.product_name}</DialogTitle></DialogHeader>
          {damage && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              logBreakage.mutate({
                inventory_id: damage.id, product_id: damage.product_id,
                quantity: Number(fd.get("quantity")), reason: String(fd.get("reason") ?? ""),
              });
            }} className="space-y-3">
              <div><Label>Quantity ({damage.unit})</Label><Input name="quantity" type="number" step="0.01" required /></div>
              <div><Label>Reason</Label><Textarea name="reason" rows={3} required /></div>
              <DialogFooter><Button type="submit" disabled={logBreakage.isPending}>{logBreakage.isPending ? "Logging…" : "Confirm Damage"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
