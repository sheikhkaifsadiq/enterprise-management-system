-- 1) Warehouses
CREATE TABLE public.warehouses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.warehouses_id_seq TO authenticated;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view warehouses" ON public.warehouses FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Managers can insert warehouses" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (public.staff_has_role(ARRAY['Manager','Admin','Super Admin']));
CREATE POLICY "Managers can update warehouses" ON public.warehouses FOR UPDATE TO authenticated USING (public.staff_has_role(ARRAY['Manager','Admin','Super Admin'])) WITH CHECK (public.staff_has_role(ARRAY['Manager','Admin','Super Admin']));
CREATE POLICY "Admins can delete warehouses" ON public.warehouses FOR DELETE TO authenticated USING (public.staff_has_role(ARRAY['Admin','Super Admin']));

CREATE TRIGGER warehouses_touch_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.warehouses (name, address, is_default) VALUES ('Main Warehouse', 'Primary Location', true);

-- 2) Add warehouse_id to inventory
ALTER TABLE public.inventory ADD COLUMN warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL;
UPDATE public.inventory SET warehouse_id = (SELECT id FROM public.warehouses WHERE is_default LIMIT 1) WHERE warehouse_id IS NULL;
CREATE INDEX inventory_warehouse_idx ON public.inventory(warehouse_id);

-- 3) Inventory transfers
CREATE TABLE public.inventory_transfers (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  from_warehouse_id BIGINT NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id BIGINT NOT NULL REFERENCES public.warehouses(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Completed',
  transferred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT different_warehouses CHECK (from_warehouse_id <> to_warehouse_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transfers TO authenticated;
GRANT ALL ON public.inventory_transfers TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.inventory_transfers_id_seq TO authenticated;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view transfers" ON public.inventory_transfers FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Managers can create transfers" ON public.inventory_transfers FOR INSERT TO authenticated WITH CHECK (public.staff_has_role(ARRAY['Manager','Admin','Super Admin']));

CREATE TRIGGER inventory_transfers_touch_updated_at BEFORE UPDATE ON public.inventory_transfers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX inventory_transfers_product_idx ON public.inventory_transfers(product_id);
CREATE INDEX inventory_transfers_created_idx ON public.inventory_transfers(created_at DESC);

-- 4) Audit logs
CREATE TABLE public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.staff_has_role(ARRAY['Admin','Super Admin']));

CREATE INDEX audit_logs_created_idx ON public.audit_logs(created_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs(entity, entity_id);
CREATE INDEX audit_logs_user_idx ON public.audit_logs(user_id);

-- 5) Audit trigger function
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_role TEXT;
  v_eid TEXT;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email, role INTO v_email, v_role FROM public.profiles WHERE id = v_uid;
  END IF;
  v_eid := COALESCE(NEW.id::TEXT, OLD.id::TEXT);
  INSERT INTO public.audit_logs (user_id, user_email, user_role, action, entity, entity_id, before_data, after_data)
  VALUES (
    v_uid, v_email, v_role, TG_OP, TG_TABLE_NAME, v_eid,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_inventory AFTER INSERT OR UPDATE OR DELETE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_inventory_transfers AFTER INSERT OR UPDATE OR DELETE ON public.inventory_transfers FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_warehouses AFTER INSERT OR UPDATE OR DELETE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- 6) Enable realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_transfers;