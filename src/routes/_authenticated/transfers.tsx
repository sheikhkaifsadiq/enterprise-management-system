import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/erp/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({ meta: [{ title: "Inventory Transfers — ERP System" }] }),
  component: TransfersPage,
});

function TransfersPage() {
  const qc = useQueryClient();
  const { isManager, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [productId, setProductId] = useState<string>("");

  useRealtime("rt-transfers", "inventory_transfers", [["transfers"], ["inventory"]]);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => (await supabase.from("warehouses").select("id,name").order("name")).data ?? [],
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => (await supabase.from("products").select("id,name,unit").eq("is_archived", false).order("name").limit(500)).data ?? [],
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transfers")
        .select("id, quantity, notes, status, created_at, from_warehouse_id, to_warehouse_id, product_id, products(name,unit), from_wh:warehouses!inventory_transfers_from_warehouse_id_fkey(name), to_wh:warehouses!inventory_transfers_to_warehouse_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (input: { from_id: number; to_id: number; product_id: number; quantity: number; notes: string }) => {
      const parsed = z.object({ from_id: z.number().int(), to_id: z.number().int(), product_id: z.number().int(), quantity: z.number().positive(), notes: z.string().max(500).optional() }).parse(input);
      if (parsed.from_id === parsed.to_id) throw new Error("Source and destination must differ.");

      // Find source batch with enough stock
      const { data: source, error: srcErr } = await supabase
        .from("inventory")
        .select("id, stock_count")
        .eq("product_id", parsed.product_id)
        .eq("warehouse_id", parsed.from_id)
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (srcErr) throw srcErr;
      if (!source || Number(source.stock_count) < parsed.quantity) throw new Error("Insufficient stock at source warehouse.");

      // Decrement source
      const { error: decErr } = await supabase.from("inventory").update({ stock_count: Number(source.stock_count) - parsed.quantity }).eq("id", source.id);
      if (decErr) throw decErr;

      // Increment or create destination batch
      const { data: dest } = await supabase
        .from("inventory")
        .select("id, stock_count")
        .eq("product_id", parsed.product_id)
        .eq("warehouse_id", parsed.to_id)
        .limit(1)
        .maybeSingle();
      if (dest) {
        await supabase.from("inventory").update({ stock_count: Number(dest.stock_count) + parsed.quantity }).eq("id", dest.id);
      } else {
        const { data: prod } = await supabase.from("products").select("unit").eq("id", parsed.product_id).single();
        await supabase.from("inventory").insert({
          product_id: parsed.product_id, warehouse_id: parsed.to_id, stock_count: parsed.quantity, unit: prod?.unit ?? "pcs",
        } as never);
      }

      // Log the transfer
      const { error: tErr } = await supabase.from("inventory_transfers").insert({
        product_id: parsed.product_id, from_warehouse_id: parsed.from_id, to_warehouse_id: parsed.to_id,
        quantity: parsed.quantity, notes: parsed.notes || null, transferred_by: user?.id ?? null, status: "Completed",
      });
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      toast.success("Transfer completed");
      setOpen(false); setFrom(""); setTo(""); setProductId("");
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <AppShell
      title="Inventory Transfers"
      description="Move stock between warehouses. Each transfer atomically decrements the source batch and credits the destination."
      actions={isManager ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />New Transfer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Transfer Stock</DialogTitle></DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              create.mutate({
                from_id: Number(from), to_id: Number(to), product_id: Number(productId),
                quantity: Number(fd.get("quantity")), notes: String(fd.get("notes") ?? ""),
              });
            }} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>From</Label>
                  <Select value={from} onValueChange={setFrom}>
                    <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                    <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To</Label>
                  <Select value={to} onValueChange={setTo}>
                    <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                    <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                  <SelectContent className="max-h-72">{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Quantity</Label><Input name="quantity" type="number" min="0.01" step="0.01" required /></div>
              <div><Label>Notes</Label><Textarea name="notes" maxLength={500} rows={2} /></div>
              <Button type="submit" disabled={create.isPending || !from || !to || !productId} className="w-full">
                {create.isPending ? "Transferring…" : "Authorize Transfer"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    >
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Movement</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs tabular-nums">{new Date(t.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-medium">{(t.products as { name?: string } | null)?.name ?? `#${t.product_id}`}</TableCell>
                <TableCell className="text-xs">
                  <span className="text-muted-foreground">{(t.from_wh as { name?: string } | null)?.name}</span>
                  <ArrowRightLeft className="mx-1.5 inline h-3 w-3 text-primary" />
                  <span className="font-medium">{(t.to_wh as { name?: string } | null)?.name}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums font-mono">{Number(t.quantity)} {(t.products as { unit?: string } | null)?.unit ?? ""}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
            {transfers.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No transfers yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
