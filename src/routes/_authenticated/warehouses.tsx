import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Warehouse, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/erp/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/warehouses")({
  head: () => ({ meta: [{ title: "Warehouses — ERP System" }] }),
  component: WarehousesPage,
});

function WarehousesPage() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").order("is_default", { ascending: false }).order("name");
      if (error) throw error;
      return data;
    },
  });

  const createWh = useMutation({
    mutationFn: async (input: { name: string; address: string }) => {
      const parsed = z.object({ name: z.string().min(1).max(120), address: z.string().max(255).optional() }).parse(input);
      const { error } = await supabase.from("warehouses").insert({ name: parsed.name, address: parsed.address || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Warehouse created"); setOpen(false); qc.invalidateQueries({ queryKey: ["warehouses"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const deleteWh = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Warehouse removed"); qc.invalidateQueries({ queryKey: ["warehouses"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <AppShell
      title="Warehouses"
      description="Physical locations where stock batches are held. Use Transfers to move inventory between sites."
      actions={isManager ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />New Warehouse</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Warehouse</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); createWh.mutate({ name: String(fd.get("name")), address: String(fd.get("address") ?? "") }); }} className="space-y-3">
              <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
              <div><Label>Address</Label><Input name="address" maxLength={255} /></div>
              <Button type="submit" disabled={createWh.isPending} className="w-full">{createWh.isPending ? "Creating…" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    >
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {warehouses.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium"><Warehouse className="mr-2 inline h-4 w-4 text-muted-foreground" />{w.name}</TableCell>
                <TableCell className="text-muted-foreground">{w.address ?? "—"}</TableCell>
                <TableCell>{w.is_default ? <Badge>Default</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                <TableCell className="text-right">
                  {isManager && !w.is_default && (
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${w.name}?`)) deleteWh.mutate(w.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {warehouses.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No warehouses configured.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
