
-- ============================================================
-- ERP SYSTEM — 1:1 schema port from MERN/PostgreSQL
-- ============================================================

-- 1. Extend role enum to match original (Super Admin, Admin, Manager, Cashier, Staff)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';

-- 2. Extend profiles with original user metadata fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS profile_pic TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Cashier';

-- 3. Drop the placeholder products table from the earlier pass
DROP TABLE IF EXISTS public.products CASCADE;

-- 4. Touch trigger for updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 5. Helper: is the current user staff with at least one of the given text roles?
CREATE OR REPLACE FUNCTION public.staff_has_role(roles TEXT[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ANY(roles));
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
$$;

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE public.categories (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.categories_id_seq TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_read   ON public.categories FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY categories_write  ON public.categories FOR ALL    TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']));

-- ============================================================
-- PRODUCTS (matches original columns exactly)
-- ============================================================
CREATE TABLE public.products (
  id                   BIGSERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  category             TEXT,
  price                NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit                 TEXT NOT NULL DEFAULT 'pcs',
  stock_count          NUMERIC(12,2) NOT NULL DEFAULT 0,
  batch_id             TEXT,
  brand                TEXT,
  size                 TEXT,
  description          TEXT,
  images               TEXT[] DEFAULT '{}',
  cover_image          TEXT,
  stock_type           TEXT NOT NULL DEFAULT 'Batch',
  low_stock_threshold  NUMERIC(12,2) NOT NULL DEFAULT 10,
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON public.products(category);
CREATE INDEX products_archived_idx ON public.products(is_archived);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.products_id_seq TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_read  ON public.products FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY products_write ON public.products FOR ALL    TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']));
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- INVENTORY (batch-level stock)
-- ============================================================
CREATE TABLE public.inventory (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id     TEXT,
  stock_count  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_product_idx ON public.inventory(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.inventory_id_seq TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_read  ON public.inventory FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY inventory_write ON public.inventory FOR ALL    TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']));
CREATE TRIGGER inventory_touch BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- CUSTOMERS (CRM — separate from staff/auth users)
-- ============================================================
CREATE TABLE public.customers (
  id           BIGSERIAL PRIMARY KEY,
  fullname     TEXT NOT NULL,
  username     TEXT,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.customers_id_seq TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_read  ON public.customers FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY customers_write ON public.customers FOR ALL    TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager','Cashier']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager','Cashier']));
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- ORDERS / ORDER_ITEMS
-- ============================================================
CREATE TABLE public.orders (
  id               BIGSERIAL PRIMARY KEY,
  customer_id      BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  fullname         TEXT NOT NULL,
  phone            TEXT,
  total_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'Pending',
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_idx ON public.orders(customer_id);
CREATE INDEX orders_status_idx   ON public.orders(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.orders_id_seq TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_read   ON public.orders FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY orders_insert ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager','Cashier']));
CREATE POLICY orders_update ON public.orders FOR UPDATE TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager','Cashier']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager','Cashier']));
CREATE POLICY orders_delete ON public.orders FOR DELETE TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin']));
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES public.products(id),
  quantity    NUMERIC(12,2) NOT NULL,
  price       NUMERIC(12,2) NOT NULL,
  unit        TEXT
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_items_id_seq TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_read  ON public.order_items FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY order_items_write ON public.order_items FOR ALL    TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager','Cashier']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager','Cashier']));

-- ============================================================
-- BREAKAGE LOGS
-- ============================================================
CREATE TABLE public.breakage_logs (
  id            BIGSERIAL PRIMARY KEY,
  inventory_id  BIGINT REFERENCES public.inventory(id) ON DELETE SET NULL,
  product_id    BIGINT NOT NULL REFERENCES public.products(id),
  staff_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  quantity      NUMERIC(12,2) NOT NULL,
  reason        TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.breakage_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.breakage_logs_id_seq TO authenticated;
GRANT ALL ON public.breakage_logs TO service_role;
ALTER TABLE public.breakage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY breakage_read  ON public.breakage_logs FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY breakage_write ON public.breakage_logs FOR ALL    TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']));

-- ============================================================
-- COUPONS
-- ============================================================
CREATE TABLE public.coupons (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL,
  value         NUMERIC(12,2) NOT NULL,
  min_purchase  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.coupons_id_seq TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY coupons_read  ON public.coupons FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY coupons_write ON public.coupons FOR ALL    TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin','Manager']));

-- ============================================================
-- SETTINGS (singleton row id=1)
-- ============================================================
CREATE TABLE public.settings (
  id              INT PRIMARY KEY DEFAULT 1,
  company_name    TEXT NOT NULL DEFAULT 'ERP System & Sanitary',
  whatsapp_number TEXT DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_read   ON public.settings FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY settings_update ON public.settings FOR UPDATE TO authenticated
  USING      (public.staff_has_role(ARRAY['Super Admin','Admin']))
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin','Admin']));
CREATE TRIGGER settings_touch BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- handle_new_user: first signup = Super Admin, rest = Cashier
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
  assigned_role TEXT;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  assigned_role := CASE WHEN is_first THEN 'Super Admin' ELSE 'Cashier' END;

  INSERT INTO public.profiles (id, email, full_name, username, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    assigned_role
  );

  -- Mirror into legacy user_roles enum for has_role() compatibility
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::app_role ELSE 'staff'::app_role END);

  RETURN NEW;
END $$;

-- Seed categories
INSERT INTO public.categories (name, description) VALUES
  ('Tiles', 'Premium flooring and wall solutions'),
  ('Sanitary', 'Luxury bathroom and kitchen fittings'),
  ('Marble', 'Natural stone collection')
ON CONFLICT (name) DO NOTHING;
