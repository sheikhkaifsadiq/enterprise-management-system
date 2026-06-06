import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Minus, Trash2, ShoppingCart, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/erp/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { formatPKR } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { cacheProducts, readCachedProducts, enqueueOrder } from "@/lib/offline-store";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [{ title: "Checkout (POS) — ERP System" }] }),
  component: CheckoutPage,
});

type CartLine = { id: number; name: string; price: number; unit: string; stock_count: number; quantity: number };

function CheckoutPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponCheck, setCouponCheck] = useState<"none" | "ok" | "fail">("none");

  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const { data: products = [] } = useQuery({
    queryKey: ["pos-products", search, isOnline],
    queryFn: async () => {
      if (!isOnline) {
        const cached = await readCachedProducts();
        const q = search.trim().toLowerCase();
        return q ? cached.filter((p) => p.name.toLowerCase().includes(q)) : cached;
      }
      let q = supabase.from("products").select("id,name,price,unit,stock_count").eq("is_archived", false).gt("stock_count", 0).order("name").limit(30);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price), unit: p.unit, stock_count: Number(p.stock_count) }));
      if (!search.trim()) await cacheProducts(rows);
      return rows;
    },
  });

  function addToCart(p: { id: number; name: string; price: number; unit: string; stock_count: number }) {
    setCart((c) => {
      const ex = c.find((x) => x.id === p.id);
      if (ex) {
        if (ex.quantity + 1 > Number(p.stock_count)) { toast.error(`Insufficient stock for ${p.name}`); return c; }
        return c.map((x) => x.id === p.id ? { ...x, quantity: x.quantity + 1 } : x);
      }
      return [...c, { id: p.id, name: p.name, price: Number(p.price), unit: p.unit, stock_count: Number(p.stock_count), quantity: 1 }];
    });
  }

  const total = useMemo(() => cart.reduce((s, l) => s + l.price * l.quantity, 0), [cart]);
  const final = Math.max(0, total - discount);

  async function applyCoupon() {
    if (!coupon.trim()) return;
    const { data } = await supabase.from("coupons").select("*").eq("code", coupon.trim().toUpperCase()).eq("status", "Active").maybeSingle();
    if (!data) { setCouponCheck("fail"); toast.error("Invalid coupon"); return; }
    if (Number(data.min_purchase) > total) { setCouponCheck("fail"); toast.error(`Min purchase ${formatPKR(data.min_purchase)} required`); return; }
    // 1:1 port: percentage or fixed
    const calc = data.type === "percentage" ? (total * Number(data.value)) / 100 : Number(data.value);
    setDiscount(calc);
    setCouponCheck("ok");
    toast.success(`Coupon applied: -${formatPKR(calc)}`);
  }

  const placeOrder = useMutation({
    mutationFn: async (input: { fullname: string; phone: string; customer_id: number | null }) => {
      z.object({ fullname: z.string().min(1).max(120), phone: z.string().max(40) }).parse({ fullname: input.fullname, phone: input.phone });
      if (cart.length === 0) throw new Error("Cart is empty.");

      if (!isOnline) {
        await enqueueOrder({
          fullname: input.fullname, phone: input.phone, customer_id: input.customer_id,
          discount,
          items: cart.map((l) => ({ product_id: l.id, name: l.name, quantity: l.quantity, price: l.price, unit: l.unit })),
        });
        return { queued: true as const };
      }

      const ids = cart.map((c) => c.id);
      const { data: dbProducts, error: prodErr } = await supabase.from("products").select("id,name,price,stock_count,unit").in("id", ids);
      if (prodErr) throw prodErr;
      type DbProd = { id: number; name: string; price: number; stock_count: number; unit: string };
      const map = new Map<number, DbProd>(((dbProducts ?? []) as DbProd[]).map((p) => [p.id, p]));
      let calculatedTotal = 0;
      const validated = cart.map((l) => {
        const p = map.get(l.id);
        if (!p) throw new Error(`Product ID ${l.id} not found in catalog.`);
        if (Number(p.stock_count) < l.quantity) throw new Error(`Insufficient stock for ${p.name}. Available: ${p.stock_count}`);
        calculatedTotal += Number(p.price) * l.quantity;
        return { ...l, price: Number(p.price), unit: p.unit };
      });
      const finalAmount = calculatedTotal - (Number(discount) || 0);

      const { data: orderRow, error: oErr } = await supabase.from("orders").insert({
        customer_id: input.customer_id, phone: input.phone, fullname: input.fullname,
        total_amount: calculatedTotal, discount_amount: discount, final_amount: finalAmount,
        status: "Pending", created_by: user?.id ?? null,
      }).select("id").single();
      if (oErr) throw oErr;
      const orderId = orderRow.id;

      for (const item of validated) {
        const { error: iErr } = await supabase.from("order_items").insert({
          order_id: orderId, product_id: item.id, quantity: item.quantity, price: item.price, unit: item.unit,
        });
        if (iErr) throw iErr;
        const { data: batch } = await supabase.from("inventory").select("id,stock_count").eq("product_id", item.id).order("updated_at", { ascending: true }).limit(1).maybeSingle();
        if (batch) {
          await supabase.from("inventory").update({ stock_count: Number(batch.stock_count) - item.quantity }).eq("id", batch.id);
        }
        const { data: pCur } = await supabase.from("products").select("stock_count").eq("id", item.id).single();
        await supabase.from("products").update({ stock_count: Number(pCur?.stock_count ?? 0) - item.quantity }).eq("id", item.id);
      }
      return { queued: false as const, orderId };
    },
    onSuccess: (res) => {
      if (res.queued) {
        toast.success("Offline — order queued locally. Will sync on reconnect.");
        setCart([]); setDiscount(0); setCoupon(""); setCouponCheck("none");
        return;
      }
      toast.success(`Order authorized · OR-${res.orderId}`);
      setCart([]); setDiscount(0); setCoupon(""); setCouponCheck("none");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      navigate({ to: "/orders" });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });


  return (
    <AppShell title="Point of Sale" description="Live transactional checkout with server-authoritative pricing and stock depletion.">
      <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
        <div className="rounded-lg border border-border bg-card p-3">
          <Input placeholder="Search product catalog…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 h-9" />
          <div className="grid max-h-[60vh] gap-2 overflow-auto md:grid-cols-2">
            {products.map((p) => (
              <button key={p.id} onClick={() => addToCart(p)} className="flex items-center justify-between rounded-md border border-border bg-card p-2.5 text-left hover:bg-accent">
                <div>
                  <div className="text-[13px] font-medium">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.stock_count} {p.unit} available</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold tabular-nums">{formatPKR(p.price)}</div>
                  <div className="text-[10px] text-muted-foreground">/ {p.unit}</div>
                </div>
              </button>
            ))}
            {products.length === 0 && <div className="col-span-2 p-6 text-center text-sm text-muted-foreground">No products match.</div>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-bold">Active Cart ({cart.length})</h2>
            <div className="space-y-1.5">
              {cart.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2">
                  <div className="flex-1">
                    <div className="text-[12px] font-medium">{l.name}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{formatPKR(l.price)} / {l.unit}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCart((c) => c.map((x) => x.id === l.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-[12px] tabular-nums">{l.quantity}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => l.quantity < l.stock_count ? setCart((c) => c.map((x) => x.id === l.id ? { ...x, quantity: x.quantity + 1 } : x)) : toast.error("Max stock reached")}><Plus className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setCart((c) => c.filter((x) => x.id !== l.id))}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {cart.length === 0 && <div className="rounded-md border border-dashed p-4 text-center text-[12px] text-muted-foreground">Cart is empty.</div>}
            </div>
            <div className="mt-3 space-y-1 border-t pt-2 text-[12px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span className="tabular-nums">{formatPKR(total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Markdown</span><span className="tabular-nums text-red-600">- {formatPKR(discount)}</span></div>
              <div className="flex justify-between border-t pt-1 text-[14px] font-bold"><span>Final</span><span className="tabular-nums">{formatPKR(final)}</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <Label className="text-[11px]">Coupon</Label>
            <div className="mt-1 flex gap-2">
              <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="CODE" className="h-8" />
              <Button size="sm" variant="outline" onClick={applyCoupon}>Apply</Button>
            </div>
            {couponCheck === "ok" && <div className="mt-1 text-[11px] text-emerald-600">Promotion applied</div>}
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            placeOrder.mutate({
              fullname: String(fd.get("fullname")), phone: String(fd.get("phone") ?? ""),
              customer_id: fd.get("customer_id") ? Number(fd.get("customer_id")) : null,
            });
          }} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <h2 className="text-sm font-bold">Customer Information</h2>
            <div><Label>Full Name</Label><Input name="fullname" required /></div>
            <div><Label>Phone</Label><Input name="phone" /></div>
            <Button type="submit" className="w-full" disabled={cart.length === 0 || placeOrder.isPending}>
              {isOnline ? <ShoppingCart className="mr-2 h-4 w-4" /> : <CloudOff className="mr-2 h-4 w-4" />}
              {placeOrder.isPending ? "Authorizing…" : isOnline ? `Authorize Order · ${formatPKR(final)}` : `Queue Order Offline · ${formatPKR(final)}`}
            </Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
