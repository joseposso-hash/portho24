-- Portho24 | Finanzas de Reservas
-- Migracion aditiva. Revisar y probar en una base de desarrollo antes de ejecutar.
-- No modifica tablas ni funciones de Parqueadero.

BEGIN;

-- 1) Configuracion financiera por area.
ALTER TABLE public.areas_comunes
  ADD COLUMN IF NOT EXISTS reservation_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'COP',
  ADD COLUMN IF NOT EXISTS allow_prepaid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_account_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_methods text[] NOT NULL DEFAULT ARRAY['transfer']::text[],
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'areas_comunes_reservation_fee_check'
      AND conrelid = 'public.areas_comunes'::regclass
  ) THEN
    ALTER TABLE public.areas_comunes
      ADD CONSTRAINT areas_comunes_reservation_fee_check
      CHECK (reservation_fee >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'areas_comunes_currency_check'
      AND conrelid = 'public.areas_comunes'::regclass
  ) THEN
    ALTER TABLE public.areas_comunes
      ADD CONSTRAINT areas_comunes_currency_check
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'areas_comunes_payment_methods_check'
      AND conrelid = 'public.areas_comunes'::regclass
  ) THEN
    ALTER TABLE public.areas_comunes
      ADD CONSTRAINT areas_comunes_payment_methods_check
      CHECK (
        payment_methods <@ ARRAY['cash','transfer','card','other']::text[]
        AND (NOT (allow_prepaid OR allow_account_charge) OR cardinality(payment_methods) > 0)
      );
  END IF;
END $$;

-- 2) Snapshot financiero en la reserva.
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS amount_due numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'COP',
  ADD COLUMN IF NOT EXISTS tariff_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS account_charged_at timestamptz;

UPDATE public.reservas
SET payment_status = 'not_required',
    payment_mode = 'free',
    tariff_snapshot = COALESCE(
      tariff_snapshot,
      jsonb_build_object(
        'legacy', true,
        'amount', 0,
        'currency', 'COP',
        'note', 'Reserva anterior a la activacion de cobros'
      )
    )
WHERE tariff_snapshot IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reservas_financial_status_check' AND conrelid='public.reservas'::regclass) THEN
    ALTER TABLE public.reservas ADD CONSTRAINT reservas_financial_status_check
      CHECK (payment_status IN ('pending','partial','paid','not_required'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reservas_payment_mode_check' AND conrelid='public.reservas'::regclass) THEN
    ALTER TABLE public.reservas ADD CONSTRAINT reservas_payment_mode_check
      CHECK (payment_mode IN ('prepaid','account','free'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reservas_amounts_check' AND conrelid='public.reservas'::regclass) THEN
    ALTER TABLE public.reservas ADD CONSTRAINT reservas_amounts_check
      CHECK (amount_due >= 0 AND amount_paid >= 0 AND amount_paid <= amount_due);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reservas_currency_check' AND conrelid='public.reservas'::regclass) THEN
    ALTER TABLE public.reservas ADD CONSTRAINT reservas_currency_check
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- 3) Libro de movimientos: cargos automaticos, pagos, reversos y ajustes.
CREATE TABLE IF NOT EXISTS public.reserva_movimientos_financieros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  reserva_id uuid NOT NULL REFERENCES public.reservas(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text,
  reference text,
  support_url text,
  notes text,
  verification_status text NOT NULL DEFAULT 'pending',
  recorded_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reserva_mov_type_check
    CHECK (movement_type IN ('charge','payment','reversal','adjustment')),
  CONSTRAINT reserva_mov_amount_check CHECK (amount > 0),
  CONSTRAINT reserva_mov_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('cash','transfer','card','other')),
  CONSTRAINT reserva_mov_status_check
    CHECK (verification_status IN ('pending','confirmed','rejected'))
);

CREATE INDEX IF NOT EXISTS idx_reserva_movimientos_reserva_fecha
  ON public.reserva_movimientos_financieros(reserva_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reserva_movimientos_tenant_fecha
  ON public.reserva_movimientos_financieros(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_account_charge
  ON public.reserva_movimientos_financieros(reserva_id)
  WHERE movement_type = 'charge';

-- 4) Crear snapshot al solicitar. Nunca confiar en el importe enviado por el navegador.
CREATE OR REPLACE FUNCTION public.prepare_reserva_financial_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_area public.areas_comunes%ROWTYPE;
  v_unit_tenant uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_area
    FROM public.areas_comunes
    WHERE id = NEW.area_id
      AND tenant_id = NEW.tenant_id
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El area no existe, esta inactiva o no pertenece al conjunto';
    END IF;

    IF NEW.unit_id IS NOT NULL THEN
      SELECT t.tenant_id INTO v_unit_tenant
      FROM public.units u
      JOIN public.towers t ON t.id = u.tower_id
      WHERE u.id = NEW.unit_id;

      IF v_unit_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'La casa no pertenece al conjunto de la reserva';
      END IF;
    END IF;

    IF v_area.reservation_fee = 0 THEN
      NEW.payment_mode := 'free';
      NEW.payment_status := 'not_required';
    ELSE
      IF NEW.payment_mode = 'prepaid' AND NOT v_area.allow_prepaid THEN
        RAISE EXCEPTION 'El pago anticipado no esta habilitado para esta area';
      ELSIF NEW.payment_mode = 'account' AND NOT v_area.allow_account_charge THEN
        RAISE EXCEPTION 'El cargo a cuenta no esta habilitado para esta area';
      ELSIF NEW.payment_mode IS NULL OR NEW.payment_mode NOT IN ('prepaid','account') THEN
        RAISE EXCEPTION 'Selecciona una modalidad de pago valida';
      END IF;
      NEW.payment_status := 'pending';
    END IF;

    NEW.amount_due := v_area.reservation_fee;
    NEW.amount_paid := 0;
    NEW.currency := v_area.currency;
    NEW.account_charged_at := NULL;
    NEW.tariff_snapshot := jsonb_build_object(
      'area_id', v_area.id,
      'area_name', v_area.name,
      'amount', v_area.reservation_fee,
      'currency', v_area.currency,
      'payment_mode', NEW.payment_mode,
      'payment_methods', v_area.payment_methods,
      'captured_at', now()
    );
    RETURN NEW;
  END IF;

  -- Los campos economicos solo pueden cambiar mediante los triggers financieros.
  IF current_setting('portho24.reserva_financial_write', true) IS DISTINCT FROM 'on' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.area_id IS DISTINCT FROM OLD.area_id
       OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
       OR NEW.amount_due IS DISTINCT FROM OLD.amount_due
       OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.tariff_snapshot IS DISTINCT FROM OLD.tariff_snapshot
       OR NEW.account_charged_at IS DISTINCT FROM OLD.account_charged_at THEN
      RAISE EXCEPTION 'Los datos economicos de la reserva no se pueden editar directamente';
    END IF;
  END IF;

  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND OLD.payment_mode = 'prepaid'
     AND OLD.amount_due > OLD.amount_paid THEN
    RAISE EXCEPTION 'Debe confirmarse el pago anticipado antes de aprobar la reserva';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_reserva_financial_data ON public.reservas;
CREATE TRIGGER trg_prepare_reserva_financial_data
BEFORE INSERT OR UPDATE ON public.reservas
FOR EACH ROW EXECUTE FUNCTION public.prepare_reserva_financial_data();

-- 5) Al aprobar una reserva a cuenta, crear una sola cuenta por cobrar.
CREATE OR REPLACE FUNCTION public.create_reserva_account_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.payment_mode = 'account'
     AND NEW.amount_due > 0 THEN
    INSERT INTO public.reserva_movimientos_financieros (
      tenant_id, reserva_id, movement_type, amount,
      verification_status, notes, created_at
    )
    VALUES (
      NEW.tenant_id, NEW.id, 'charge', NEW.amount_due,
      'confirmed', 'Cargo a cuenta generado al aprobar la reserva', now()
    )
    ON CONFLICT DO NOTHING;

    PERFORM set_config('portho24.reserva_financial_write', 'on', true);
    UPDATE public.reservas
    SET account_charged_at = COALESCE(account_charged_at, now())
    WHERE id = NEW.id;
    PERFORM set_config('portho24.reserva_financial_write', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_reserva_account_charge ON public.reservas;
CREATE TRIGGER trg_create_reserva_account_charge
AFTER UPDATE OF status ON public.reservas
FOR EACH ROW EXECUTE FUNCTION public.create_reserva_account_charge();

-- 6) Validar movimientos, su reserva y el tenant. Bloquear la reserva evita sobrepagos concurrentes.
CREATE OR REPLACE FUNCTION public.validate_reserva_financial_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reserva public.reservas%ROWTYPE;
  v_confirmed numeric(12,2);
BEGIN
  SELECT * INTO v_reserva
  FROM public.reservas
  WHERE id = NEW.reserva_id
  FOR UPDATE;

  IF NOT FOUND OR v_reserva.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'La reserva no existe o no pertenece al conjunto indicado';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.movement_type = 'charge' THEN
      IF NEW.verification_status <> 'confirmed'
         OR NEW.amount <> v_reserva.amount_due
         OR v_reserva.payment_mode <> 'account' THEN
        RAISE EXCEPTION 'Cargo de cuenta no valido';
      END IF;
    ELSIF NEW.movement_type = 'payment' THEN
      IF NEW.verification_status <> 'pending' THEN
        RAISE EXCEPTION 'Los pagos reportados deben quedar pendientes de validacion';
      END IF;
      IF NEW.recorded_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'El usuario que registra el pago no coincide con la sesion';
      END IF;
      IF NEW.payment_method IS NULL
         OR NOT ((v_reserva.tariff_snapshot -> 'payment_methods') ? NEW.payment_method) THEN
        RAISE EXCEPTION 'El medio de pago no esta habilitado para esta reserva';
      END IF;
      SELECT COALESCE(SUM(amount), 0)
      INTO v_confirmed
      FROM public.reserva_movimientos_financieros
      WHERE reserva_id = NEW.reserva_id
        AND movement_type = 'payment'
        AND verification_status IN ('pending','confirmed');

      IF v_confirmed + NEW.amount > v_reserva.amount_due THEN
        RAISE EXCEPTION 'Los pagos reportados superan el saldo de la reserva';
      END IF;
      IF v_reserva.status NOT IN ('pending','approved')
         OR v_reserva.payment_mode = 'free'
         OR v_reserva.amount_due <= v_reserva.amount_paid THEN
        RAISE EXCEPTION 'La reserva no tiene un saldo reportable';
      END IF;
    ELSIF NEW.movement_type IN ('reversal','adjustment') THEN
      IF NOT (SELECT public.is_tenant_admin()) THEN
        RAISE EXCEPTION 'Solo administracion puede registrar reversos o ajustes';
      END IF;
      IF NEW.verification_status <> 'confirmed' THEN
        RAISE EXCEPTION 'El ajuste debe quedar confirmado por administracion';
      END IF;
    END IF;
  ELSE
    IF NEW.reserva_id IS DISTINCT FROM OLD.reserva_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.movement_type IS DISTINCT FROM OLD.movement_type
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN
      RAISE EXCEPTION 'No se puede alterar el origen ni el valor de un movimiento';
    END IF;

    IF OLD.verification_status <> 'pending'
       OR NEW.verification_status NOT IN ('confirmed','rejected') THEN
      RAISE EXCEPTION 'El movimiento ya fue procesado o la transicion no es valida';
    END IF;

    IF NOT (SELECT public.is_tenant_admin()) THEN
      RAISE EXCEPTION 'Solo administracion puede validar pagos';
    END IF;

    NEW.verified_by := auth.uid();
    NEW.verified_at := now();
  END IF;

  IF NEW.movement_type IN ('payment','reversal')
     AND NEW.verification_status = 'confirmed' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type = 'payment' AND verification_status = 'confirmed' THEN amount
        WHEN movement_type = 'reversal' AND verification_status = 'confirmed' THEN -amount
        ELSE 0
      END
    ), 0)
    INTO v_confirmed
    FROM public.reserva_movimientos_financieros
    WHERE reserva_id = NEW.reserva_id
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF NEW.movement_type = 'payment' THEN
      v_confirmed := v_confirmed + NEW.amount;
    ELSE
      v_confirmed := v_confirmed - NEW.amount;
    END IF;

    IF v_confirmed < 0 OR v_confirmed > v_reserva.amount_due THEN
      RAISE EXCEPTION 'El movimiento supera el saldo permitido de la reserva';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_reserva_financial_movement
  ON public.reserva_movimientos_financieros;
CREATE TRIGGER trg_validate_reserva_financial_movement
BEFORE INSERT OR UPDATE ON public.reserva_movimientos_financieros
FOR EACH ROW EXECUTE FUNCTION public.validate_reserva_financial_movement();

-- 7) Mantener amount_paid y payment_status desde movimientos confirmados.
CREATE OR REPLACE FUNCTION public.refresh_reserva_payment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reserva_id uuid;
  v_paid numeric(12,2);
BEGIN
  v_reserva_id := COALESCE(NEW.reserva_id, OLD.reserva_id);

  SELECT COALESCE(SUM(
    CASE
      WHEN movement_type = 'payment' AND verification_status = 'confirmed' THEN amount
      WHEN movement_type = 'reversal' AND verification_status = 'confirmed' THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_paid
  FROM public.reserva_movimientos_financieros
  WHERE reserva_id = v_reserva_id;

  PERFORM set_config('portho24.reserva_financial_write', 'on', true);
  UPDATE public.reservas
  SET amount_paid = v_paid,
      payment_status = CASE
        WHEN amount_due = 0 THEN 'not_required'
        WHEN v_paid = 0 THEN 'pending'
        WHEN v_paid < amount_due THEN 'partial'
        ELSE 'paid'
      END
  WHERE id = v_reserva_id;
  PERFORM set_config('portho24.reserva_financial_write', 'off', true);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_reserva_payment_totals
  ON public.reserva_movimientos_financieros;
CREATE TRIGGER trg_refresh_reserva_payment_totals
AFTER INSERT OR UPDATE OR DELETE ON public.reserva_movimientos_financieros
FOR EACH ROW EXECUTE FUNCTION public.refresh_reserva_payment_totals();

-- 8) Seguridad por conjunto y por casa.
ALTER TABLE public.reserva_movimientos_financieros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reserva_movimientos_select_scoped
  ON public.reserva_movimientos_financieros;
CREATE POLICY reserva_movimientos_select_scoped
ON public.reserva_movimientos_financieros
FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT public.current_user_tenant_id())
  AND (
    (SELECT public.is_tenant_admin())
    OR EXISTS (
      SELECT 1 FROM public.reservas r
      WHERE r.id = reserva_movimientos_financieros.reserva_id
        AND r.tenant_id = reserva_movimientos_financieros.tenant_id
        AND r.unit_id = (SELECT public.current_user_unit_id())
        AND (SELECT public.is_tenant_resident())
    )
  )
);

DROP POLICY IF EXISTS reserva_movimientos_resident_insert
  ON public.reserva_movimientos_financieros;
CREATE POLICY reserva_movimientos_resident_insert
ON public.reserva_movimientos_financieros
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (SELECT public.current_user_tenant_id())
  AND movement_type = 'payment'
  AND verification_status = 'pending'
  AND recorded_by = (SELECT auth.uid())
  AND (SELECT public.is_tenant_resident())
  AND EXISTS (
    SELECT 1 FROM public.reservas r
    WHERE r.id = reserva_movimientos_financieros.reserva_id
      AND r.tenant_id = reserva_movimientos_financieros.tenant_id
      AND r.unit_id = (SELECT public.current_user_unit_id())
      AND r.status IN ('pending','approved')
      AND r.amount_due > r.amount_paid
  )
);

DROP POLICY IF EXISTS reserva_movimientos_admin_insert
  ON public.reserva_movimientos_financieros;
CREATE POLICY reserva_movimientos_admin_insert
ON public.reserva_movimientos_financieros
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (SELECT public.current_user_tenant_id())
  AND (SELECT public.is_tenant_admin())
  AND movement_type IN ('payment','reversal')
);

DROP POLICY IF EXISTS reserva_movimientos_admin_update
  ON public.reserva_movimientos_financieros;
CREATE POLICY reserva_movimientos_admin_update
ON public.reserva_movimientos_financieros
FOR UPDATE TO authenticated
USING (
  tenant_id = (SELECT public.current_user_tenant_id())
  AND (SELECT public.is_tenant_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.current_user_tenant_id())
  AND (SELECT public.is_tenant_admin())
);

REVOKE DELETE ON public.reserva_movimientos_financieros FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reserva_movimientos_financieros TO authenticated;
GRANT ALL ON public.reserva_movimientos_financieros TO service_role;

COMMIT;

-- Importante:
-- * Las areas existentes quedan con tarifa 0 y cobros deshabilitados hasta configurarlas.
-- * La reserva conserva el precio y las condiciones vigentes al solicitarla.
-- * El cargo a cuenta se registra automaticamente al aprobar la reserva.
-- * Los pagos reportados por el residente quedan pendientes hasta validacion administrativa.
-- * La politica de Storage para soportes debe configurarse antes de habilitar carga de archivos.
-- * Probar todos los casos en desarrollo antes de aplicar en produccion.
