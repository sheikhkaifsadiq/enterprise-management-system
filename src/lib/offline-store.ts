// Offline-first store: cache products for POS browsing + queue orders to sync when reconnected.
import { get, set, del } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

export type CachedProduct = {
  id: number;
  name: string;
  price: number;
  unit: string;
  stock_count: number;
};

export type QueuedOrder = {
  client_id: string;
  fullname: string;
  phone: string;
  customer_id: number | null;
  discount: number;
  items: { product_id: number; name: string; quantity: number; price: number; unit: string }[];
  queued_at: number;
};

const PRODUCTS_KEY = "erp.cache.products";
const QUEUE_KEY = "erp.queue.orders";

export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  await set(PRODUCTS_KEY, { at: Date.now(), products });
}

export async function readCachedProducts(): Promise<CachedProduct[]> {
  const v = await get<{ at: number; products: CachedProduct[] }>(PRODUCTS_KEY);
  return v?.products ?? [];
}

export async function getQueue(): Promise<QueuedOrder[]> {
  return (await get<QueuedOrder[]>(QUEUE_KEY)) ?? [];
}

export async function enqueueOrder(order: Omit<QueuedOrder, "client_id" | "queued_at">): Promise<QueuedOrder> {
  const queue = await getQueue();
  const entry: QueuedOrder = { ...order, client_id: crypto.randomUUID(), queued_at: Date.now() };
  queue.push(entry);
  await set(QUEUE_KEY, queue);
  window.dispatchEvent(new CustomEvent("erp:queue-changed"));
  return entry;
}

export async function clearQueue(): Promise<void> {
  await del(QUEUE_KEY);
  window.dispatchEvent(new CustomEvent("erp:queue-changed"));
}

export async function flushQueue(userId: string | null): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };
  let synced = 0;
  let failed = 0;
  const remaining: QueuedOrder[] = [];
  for (const q of queue) {
    try {
      const total = q.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const finalAmount = Math.max(0, total - (q.discount || 0));
      const { data: orderRow, error: oErr } = await supabase.from("orders").insert({
        customer_id: q.customer_id, phone: q.phone, fullname: q.fullname,
        total_amount: total, discount_amount: q.discount, final_amount: finalAmount,
        status: "Pending", created_by: userId,
      }).select("id").single();
      if (oErr || !orderRow) throw oErr ?? new Error("insert failed");
      for (const it of q.items) {
        await supabase.from("order_items").insert({
          order_id: orderRow.id, product_id: it.product_id, quantity: it.quantity, price: it.price, unit: it.unit,
        });
        const { data: pCur } = await supabase.from("products").select("stock_count").eq("id", it.product_id).single();
        await supabase.from("products").update({ stock_count: Number(pCur?.stock_count ?? 0) - it.quantity }).eq("id", it.product_id);
      }
      synced += 1;
    } catch (e) {
      console.warn("queued order sync failed", e);
      failed += 1;
      remaining.push(q);
    }
  }
  await set(QUEUE_KEY, remaining);
  window.dispatchEvent(new CustomEvent("erp:queue-changed"));
  return { synced, failed };
}
