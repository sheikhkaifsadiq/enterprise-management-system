import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/erp/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({ meta: [{ title: "Categories — ERP System" }] }),
  component: CategoryManagerPage,
});

type Cat = { id: number; name: string; description: string | null };

function CategoryManagerPage() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const add = useMutation({
    mutationFn: async (input: { name: string; description: string }) => {
      const { error } = await supabase.from("categories").insert(input);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category indexed"); setOpen(false); qc.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category terminated"); qc.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <AppShell
      title="Category Index"
      description="Master category taxonomy for the asset catalog."
      actions={isManager && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />New Category</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Category Protocol</DialogTitle></DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              add.mutate({ name: String(fd.get("name")), description: String(fd.get("description") ?? "") });
            }} className="space-y-3">
              <div><Label>Name</Label><Input name="name" required /></div>
              <div><Label>Description</Label><Input name="description" /></div>
              <DialogFooter><Button type="submit" disabled={add.isPending}>{add.isPending ? "Indexing…" : "Index"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="erp-table">
          <thead><tr><th className="erp-th">Name</th><th className="erp-th">Description</th>{isManager && <th className="erp-th text-right">Actions</th>}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="erp-row-hover">
                <td className="erp-td font-medium">{c.name}</td>
                <td className="erp-td text-muted-foreground">{c.description ?? "—"}</td>
                {isManager && (
                  <td className="erp-td text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="erp-td text-center text-muted-foreground">No categories indexed.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
