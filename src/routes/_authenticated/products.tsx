import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Search, TrendingUp, QrCode } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/erp/AppShell";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Barcode } from "@/components/erp/Barcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";
import { formatPKR } from "@/lib/format";
import { uploadProductImage } from "@/lib/uploadProductImage";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products — ERP System" }] }),
  component: ProductsPage,
});

type Product = {
  id: number; name: string; category: string | null; price: number; unit: string;
  stock_count: number; batch_id: string | null; brand: string | null; size: string | null;
  description: string | null; images: string[] | null; cover_image: string | null;
  stock_type: string; low_stock_threshold: number; is_archived: boolean;
};

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  price: z.coerce.number().min(0).max(10_000_000),
  unit: z.string().trim().min(1).max(20),
  stock_count: z.coerce.number().min(0).max(10_000_000),
  batch_id: z.string().trim().max(60).optional().or(z.literal("")),
  brand: z.string().trim().max(80).optional().or(z.literal("")),
  size: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  cover_image: z.string().trim().max(500_000).optional().or(z.literal("")),
  stock_type: z.string().trim().max(20),
  low_stock_threshold: z.coerce.number().min(0).max(10_000_000),
});

function ProductsPage() {
  const qc = useQueryClient();
  const { isManager, isAdmin } = useAuth();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [barcodeFor, setBarcodeFor] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["products", tab, search],
    queryFn: async () => {
      let q = supabase.from("products").select("*").eq("is_archived", tab === "archived").order("id", { ascending: false });
      if (search.trim()) {
        const t = `%${search.trim()}%`;
        q = q.or(`name.ilike.${t},category.ilike.${t},brand.ilike.${t},batch_id.ilike.${t}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<Product> & { id?: number }) => {
      const payload = {
        name: input.name ?? "", category: input.category || null, price: input.price ?? 0,
        unit: input.unit ?? "pcs", stock_count: input.stock_count ?? 0,
        batch_id: input.batch_id || null, brand: input.brand || null, size: input.size || null,
        description: input.description || null, cover_image: input.cover_image || null,
        stock_type: input.stock_type ?? "Batch",
        low_stock_threshold: input.low_stock_threshold ?? 10,
      };
      if (input.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Asset synchronized" : "Asset deployed to catalog");
      setOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const archive = useMutation({
    mutationFn: async ({ id, val }: { id: number; val: boolean }) => {
      const { error } = await supabase.from("products").update({ is_archived: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Asset terminated"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("cover_file") as File | null;
    let cover_image = editing?.cover_image ?? "";
    if (file && file.size > 0) {
      try {
        setUploading(true);
        cover_image = await uploadProductImage(file);
      } catch (err) {
        setUploading(false);
        toast.error(humanizeError(err));
        return;
      } finally {
        setUploading(false);
      }
    }
    const parsed = productSchema.safeParse({
      name: fd.get("name"), category: fd.get("category") || "",
      price: fd.get("price"), unit: fd.get("unit") || "pcs",
      stock_count: fd.get("stock_count"), batch_id: fd.get("batch_id") || "",
      brand: fd.get("brand") || "", size: fd.get("size") || "",
      description: fd.get("description") || "", cover_image,
      stock_type: fd.get("stock_type") || "Batch",
      low_stock_threshold: fd.get("low_stock_threshold") || 10,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    upsert.mutate({ ...parsed.data, ...(editing ? { id: editing.id } : {}) } as Partial<Product> & { id?: number });
  }

  const editorOpen = open || !!editing;
  const e = editing;

  return (
    <AppShell
      title="Catalog Assets"
      description="Full product catalog with batch metadata and high-resolution imagery."
      actions={isManager && (
        <>
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}><TrendingUp className="mr-1.5 h-3.5 w-3.5" />Global Adjust</Button>
          <Dialog open={editorOpen} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Add Asset</Button></DialogTrigger>
            <ProductEditor product={e} onSubmit={handleSubmit} pending={upsert.isPending || uploading} />
          </Dialog>
        </>
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
          <TabsList><TabsTrigger value="active">Active</TabsTrigger><TabsTrigger value="archived">Archived</TabsTrigger></TabsList>
        </Tabs>
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, category, brand, batch…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-[13px]" />
        </div>
        <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">{rows.length} items</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? <TableSkeleton rows={10} cols={8} /> : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No assets found.</div>
        ) : (
          <div className="max-h-[calc(100vh-240px)] overflow-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="erp-th">Image</th>
                  <th className="erp-th">Name</th>
                  <th className="erp-th">Category</th>
                  <th className="erp-th">Brand</th>
                  <th className="erp-th">Size</th>
                  <th className="erp-th">Batch</th>
                  <th className="erp-th text-right">Price</th>
                  <th className="erp-th text-right">Stock</th>
                  {isManager && <th className="erp-th text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const low = Number(p.stock_count) <= Number(p.low_stock_threshold);
                  return (
                    <tr key={p.id} className="erp-row-hover">
                      <td className="erp-td">{p.cover_image ? <img src={p.cover_image} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-muted" />}</td>
                      <td className="erp-td font-medium">{p.name}</td>
                      <td className="erp-td text-muted-foreground">{p.category ?? "—"}</td>
                      <td className="erp-td text-muted-foreground">{p.brand ?? "—"}</td>
                      <td className="erp-td text-muted-foreground">{p.size ?? "—"}</td>
                      <td className="erp-td font-mono text-[11px] text-muted-foreground">{p.batch_id ?? "—"}</td>
                      <td className="erp-td text-right tabular-nums">{formatPKR(p.price)}</td>
                      <td className={`erp-td text-right tabular-nums font-medium ${low ? "text-amber-600" : ""}`}>{p.stock_count} {p.unit}</td>
                      {isManager && (
                        <td className="erp-td text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Barcode" onClick={() => setBarcodeFor(p)}><QrCode className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => archive.mutate({ id: p.id, val: !p.is_archived })}>
                              {p.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            </Button>
                            {isAdmin && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Terminate {p.name}?</AlertDialogTitle><AlertDialogDescription>Permanent. Removes asset from catalog.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(p.id)}>Terminate</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BulkAdjustDialog open={bulkOpen} onOpenChange={setBulkOpen} />

      <Dialog open={!!barcodeFor} onOpenChange={(o) => !o && setBarcodeFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{barcodeFor?.name}</DialogTitle></DialogHeader>
          {barcodeFor && (
            <div className="flex flex-col items-center gap-3 py-2">
              <Barcode value={`SKU-${barcodeFor.id}`} height={50} scale={2} />
              <div className="text-[11px] text-muted-foreground">Scannable Code128 — Auto-generated from product ID</div>
              <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ProductEditor({ product, onSubmit, pending }: { product: Product | null; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; pending: boolean }) {
  const e = product;
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{e ? `Edit ${e.name}` : "Register New Asset"}</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
        <Field label="Name" name="name" defaultValue={e?.name} required />
        <Field label="Category" name="category" defaultValue={e?.category ?? ""} />
        <Field label="Brand" name="brand" defaultValue={e?.brand ?? ""} />
        <Field label="Size" name="size" defaultValue={e?.size ?? ""} />
        <Field label="Price (Rs.)" name="price" type="number" step="0.01" defaultValue={e?.price ?? 0} />
        <Field label="Unit" name="unit" defaultValue={e?.unit ?? "pcs"} />
        <Field label="Stock Count" name="stock_count" type="number" step="0.01" defaultValue={e?.stock_count ?? 0} />
        <Field label="Low Stock Threshold" name="low_stock_threshold" type="number" defaultValue={e?.low_stock_threshold ?? 10} />
        <Field label="Batch ID" name="batch_id" defaultValue={e?.batch_id ?? ""} />
        <div className="space-y-1.5">
          <Label htmlFor="stock_type">Stock Type</Label>
          <Select name="stock_type" defaultValue={e?.stock_type ?? "Batch"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Batch">Batch</SelectItem><SelectItem value="Unit">Unit</SelectItem><SelectItem value="Bulk">Bulk</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" defaultValue={e?.description ?? ""} rows={2} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="cover_file">Cover Image (max 5MB)</Label>
          <Input id="cover_file" name="cover_file" type="file" accept="image/*" />
          {e?.cover_image && <img src={e.cover_image} alt="" className="h-16 w-16 rounded object-cover" />}
        </div>
        <DialogFooter className="col-span-2">
          <Button type="submit" disabled={pending}>{pending ? "Synchronizing…" : "Save Asset"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function BulkAdjustDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (input: { type: string; target: string; percentage: number; action: string }) => {
      // 1:1 port of productController.bulkUpdatePrices
      const factor = input.action === "increase" ? 1 + input.percentage / 100 : 1 - input.percentage / 100;
      const column = input.type === "category" ? "category" : "brand";
      const { data: items, error } = await supabase.from("products").select("id,price").eq(column, input.target);
      if (error) throw error;
      for (const it of items ?? []) {
        await supabase.from("products").update({ price: Number(it.price) * factor }).eq("id", it.id);
      }
      return items?.length ?? 0;
    },
    onSuccess: (n) => { toast.success(`Market adjustment complete (${n} assets)`); onOpenChange(false); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Global Valuation Adjustment</DialogTitle></DialogHeader>
        <form onSubmit={(ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          mut.mutate({
            type: String(fd.get("type")), target: String(fd.get("target")),
            percentage: Number(fd.get("percentage")), action: String(fd.get("action")),
          });
        }} className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Type</Label>
            <Select name="type" defaultValue="category"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="category">Category</SelectItem><SelectItem value="brand">Brand</SelectItem></SelectContent></Select>
          </div>
          <Field label="Target" name="target" required />
          <Field label="Percentage" name="percentage" type="number" step="0.01" required />
          <div className="space-y-1.5"><Label>Action</Label>
            <Select name="action" defaultValue="increase"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="increase">Increase</SelectItem><SelectItem value="decrease">Decrease</SelectItem></SelectContent></Select>
          </div>
          <DialogFooter className="col-span-2"><Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Adjusting…" : "Apply"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, name, type = "text", defaultValue, required, step }: {
  label: string; name: string; type?: string; defaultValue?: string | number | null; required?: boolean; step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} step={step} defaultValue={defaultValue ?? ""} required={required} />
    </div>
  );
}
