-- Portho24 | Cierre financiero, devoluciones y soportes de Reservas
-- Complementa 20261112160000_reservas_finanzas.sql. No modifica Parqueadero.

BEGIN;

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS account_charge_status text NOT NULL DEFAULT 'not_charged';

ALTER TABLE public.reservas
  DROP CONSTRAINT IF EXISTS reservas_refund_status_check,
  ADD CONSTRAINT reservas_refund_status_check
    CHECK (refund_status IN ('not_applicable','pending','partial','refunded')),
  DROP CONSTRAINT IF EXISTS reservas_account_charge_status_check,
  ADD CONSTRAINT reservas_account_charge_status_check
    CHECK (account_charge_status IN ('not_charged','charged','reversed'));

ALTER TABLE public.reserva_movimientos_financieros
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid,
  ADD COLUMN IF NOT EXISTS support_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserva_mov_reversal_of_fk'
      AND conrelid = 'public.reserva_movimientos_financieros'::regclass
  ) THEN
    ALTER TABLE public.reserva_movimientos_financieros
      ADD CONSTRAINT reserva_mov_reversal_of_fk
      FOREIGN KEY (reversal_of_id)
      REFERENCES public.reserva_movimientos_financieros(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.reserva_movimientos_financieros
  DROP CONSTRAINT IF EXISTS reserva_mov_type_check,
  ADD CONSTRAINT reserva_mov_type_check
    CHECK (movement_type IN ('charge','payment','reversal','charge_reversal','refund','adjustment'));

CREATE INDEX IF NOT EXISTS idx_reserva_mov_reversal_of
  ON public.reserva_movimientos_financieros(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_charge_reversal
  ON public.reserva_movimientos_financieros(reversal_of_id)
  WHERE movement_type = 'charge_reversal';

-- Bucket privado para comprobantes. Los objetos no se hacen públicos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reserva-soportes',
  'reserva-soportes',
  false,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png'];

DROP POLICY IF EXISTS reserva_soportes_insert_resident ON storage.objects;
CREATE POLICY reserva_soportes_insert_resident
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reserva-soportes'
  AND split_part(name, '/', 1) = (SELECT public.current_user_tenant_id())::text
  AND split_part(name, '/', 3) = (SELECT auth.uid())::text
  AND (SELECT public.is_tenant_resident())
  AND EXISTS (
    SELECT 1
    FROM public.reservas r
    WHERE r.id::text = split_part(name, '/', 2)
      AND r.tenant_id = (SELECT public.current_user_tenant_id())
      AND r.unit_id = (SELECT public.current_user_unit_id())
      AND r.status IN ('pending','approved')
  )
);

DROP POLICY IF EXISTS reserva_soportes_delete_own ON storage.objects;
CREATE POLICY reserva_soportes_delete_own
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'reserva-soportes'
  AND split_part(name, '/', 1) = (SELECT public.current_user_tenant_id())::text
  AND split_part(name, '/', 3) = (SELECT auth.uid())::text
  AND (SELECT public.is_tenant_resident())
);

DROP POLICY IF EXISTS reserva_soportes_select_scoped ON storage.objects;
CREATE POLICY reserva_soportes_select_scoped
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'reserva-soportes'
  AND (
    (
      split_part(name, '/', 1) = (SELECT public.current_user_tenant_id())::text
      AND (SELECT public.is_tenant_admin())
    )
    OR
    (
      split_part(name, '/', 1) = (SELECT public.current_user_tenant_id())::text
      AND (SELECT public.is_tenant_resident())
      AND EXISTS (
        SELECT 1
        FROM public.reservas r
        WHERE r.id::text = split_part(name, '/', 2)
          AND r.tenant_id = (SELECT public.current_user_tenant_id())
          AND r.unit_id = (SELECT public.current_user_unit_id())
      )
    )
  )
);

-- Reemplaza el validador para diferenciar reverso de cargo y devolución de dinero.
CREATE OR REPLACE FUNCTION public.validate_reserva_financial_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reserva public.reservas%ROWTYPE;
  v_original public.reserva_movimientos_financieros%ROWTYPE;
  v_total numeric(12,2);
  v_reversed numeric(12,2);
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
      IF NEW.verification_status <> 'pending'
         OR NEW.recorded_by IS DISTINCT FROM auth.uid()
         OR NEW.payment_method IS NULL
         OR NOT ((v_reserva.tariff_snapshot -> 'payment_methods') ? NEW.payment_method) THEN
        RAISE EXCEPTION 'Reporte de pago no valido';
      END IF;

      SELECT COALESCE(SUM(amount), 0)
      INTO v_total
      FROM public.reserva_movimientos_financieros
      WHERE reserva_id = NEW.reserva_id
        AND movement_type = 'payment'
        AND verification_status IN ('pending','confirmed');

      IF v_total + NEW.amount > v_reserva.amount_due
         OR v_reserva.status NOT IN ('pending','approved')
         OR v_reserva.payment_mode = 'free'
         OR v_reserva.amount_due <= v_reserva.amount_paid THEN
        RAISE EXCEPTION 'El pago reportado supera el saldo o la reserva no admite pagos';
      END IF;

      IF NEW.support_path IS NOT NULL THEN
        IF split_part(NEW.support_path, '/', 1) <> NEW.tenant_id::text
           OR split_part(NEW.support_path, '/', 2) <> NEW.reserva_id::text
           OR split_part(NEW.support_path, '/', 3) <> auth.uid()::text THEN
          RAISE EXCEPTION 'La ruta del soporte no corresponde al usuario y reserva';
        END IF;
      END IF;

    ELSIF NEW.movement_type IN ('charge_reversal','refund') THEN
      IF NOT (SELECT public.is_tenant_admin())
         OR NEW.verification_status <> 'confirmed'
         OR NEW.reversal_of_id IS NULL THEN
        RAISE EXCEPTION 'Solo administracion puede registrar reversos o devoluciones confirmadas';
      END IF;

      SELECT * INTO v_original
      FROM public.reserva_movimientos_financieros
      WHERE id = NEW.reversal_of_id
        AND reserva_id = NEW.reserva_id
        AND tenant_id = NEW.tenant_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el movimiento original relacionado';
      END IF;

      IF NEW.movement_type = 'charge_reversal' THEN
        IF v_original.movement_type <> 'charge'
           OR v_reserva.status <> 'cancelled'
           OR NEW.amount <> v_original.amount THEN
          RAISE EXCEPTION 'El reverso debe anular el cargo original de una reserva cancelada';
        END IF;
      ELSE
        IF v_original.movement_type <> 'payment'
           OR v_original.verification_status <> 'confirmed'
           OR v_reserva.status <> 'cancelled' THEN
          RAISE EXCEPTION 'La devolucion debe corresponder a un pago confirmado de una reserva cancelada';
        END IF;

        SELECT COALESCE(SUM(amount), 0)
        INTO v_reversed
        FROM public.reserva_movimientos_financieros
        WHERE reversal_of_id = NEW.reversal_of_id
          AND movement_type = 'refund'
          AND verification_status = 'confirmed';

        IF v_reversed + NEW.amount > v_original.amount THEN
          RAISE EXCEPTION 'La devolucion supera el valor del pago original';
        END IF;
      END IF;

      NEW.verified_by := auth.uid();
      NEW.verified_at := now();

    ELSIF NEW.movement_type IN ('reversal','adjustment') THEN
      IF NOT (SELECT public.is_tenant_admin())
         OR NEW.verification_status <> 'confirmed' THEN
        RAISE EXCEPTION 'Solo administracion puede registrar ajustes confirmados';
      END IF;
    END IF;

  ELSE
    IF NEW.reserva_id IS DISTINCT FROM OLD.reserva_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.movement_type IS DISTINCT FROM OLD.movement_type
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
       OR NEW.reversal_of_id IS DISTINCT FROM OLD.reversal_of_id THEN
      RAISE EXCEPTION 'No se puede alterar el origen ni el valor de un movimiento';
    END IF;

    IF OLD.verification_status <> 'pending'
       OR NEW.verification_status NOT IN ('confirmed','rejected')
       OR NOT (SELECT public.is_tenant_admin()) THEN
      RAISE EXCEPTION 'El movimiento ya fue procesado o no tienes permiso para validarlo';
    END IF;

    NEW.verified_by := auth.uid();
    NEW.verified_at := now();
  END IF;

  IF NEW.movement_type IN ('payment','refund','reversal')
     AND NEW.verification_status = 'confirmed' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type = 'payment' AND verification_status = 'confirmed' THEN amount
        WHEN movement_type IN ('refund','reversal') AND verification_status = 'confirmed' THEN -amount
        ELSE 0
      END
    ), 0)
    INTO v_total
    FROM public.reserva_movimientos_financieros
    WHERE reserva_id = NEW.reserva_id
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF NEW.movement_type = 'payment' THEN
      v_total := v_total + NEW.amount;
    ELSE
      v_total := v_total - NEW.amount;
    END IF;

    IF v_total < 0 OR v_total > v_reserva.amount_due THEN
      RAISE EXCEPTION 'El movimiento supera el saldo permitido de la reserva';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Actualiza totales y estado de devolucion a partir del libro de movimientos.
CREATE OR REPLACE FUNCTION public.refresh_reserva_payment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reserva_id uuid;
  v_paid numeric(12,2);
  v_gross_paid numeric(12,2);
  v_refunded numeric(12,2);
  v_cancelled boolean;
BEGIN
  v_reserva_id := COALESCE(NEW.reserva_id, OLD.reserva_id);

  SELECT
    COALESCE(SUM(CASE
      WHEN movement_type = 'payment' AND verification_status = 'confirmed' THEN amount
      WHEN movement_type IN ('refund','reversal') AND verification_status = 'confirmed' THEN -amount
      ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN movement_type = 'payment' AND verification_status = 'confirmed' THEN amount
      ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN movement_type IN ('refund','reversal') AND verification_status = 'confirmed' THEN amount
      ELSE 0 END), 0)
  INTO v_paid, v_gross_paid, v_refunded
  FROM public.reserva_movimientos_financieros
  WHERE reserva_id = v_reserva_id;

  SELECT status = 'cancelled' INTO v_cancelled
  FROM public.reservas WHERE id = v_reserva_id;

  PERFORM set_config('portho24.reserva_financial_write', 'on', true);
  UPDATE public.reservas
  SET amount_paid = v_paid,
      payment_status = CASE
        WHEN amount_due = 0 THEN 'not_required'
        WHEN v_paid = 0 THEN 'pending'
        WHEN v_paid < amount_due THEN 'partial'
        ELSE 'paid'
      END,
      refund_status = CASE
        WHEN NOT COALESCE(v_cancelled, false) OR v_gross_paid = 0 THEN 'not_applicable'
        WHEN v_refunded = 0 THEN 'pending'
        WHEN v_refunded < v_gross_paid THEN 'partial'
        ELSE 'refunded'
      END
  WHERE id = v_reserva_id;
  PERFORM set_config('portho24.reserva_financial_write', 'off', true);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Si se cancela una reserva, se anulan reportes sin validar y se revierte el cargo a cuenta.
-- Los pagos ya recibidos no se devuelven automáticamente: quedan pendientes de decisión administrativa.
CREATE OR REPLACE FUNCTION public.handle_reserva_cancellation_finances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_charge public.reserva_movimientos_financieros%ROWTYPE;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.reserva_movimientos_financieros
    SET verification_status = 'rejected',
        verified_by = auth.uid(),
        verified_at = now(),
        notes = concat_ws(E'\n', notes, 'Reporte cerrado por cancelacion de la reserva')
    WHERE reserva_id = NEW.id
      AND movement_type = 'payment'
      AND verification_status = 'pending';

    IF NEW.payment_mode = 'account' THEN
      SELECT * INTO v_charge
      FROM public.reserva_movimientos_financieros
      WHERE reserva_id = NEW.id
        AND movement_type = 'charge'
        AND verification_status = 'confirmed'
      LIMIT 1;

      IF FOUND AND NOT EXISTS (
        SELECT 1 FROM public.reserva_movimientos_financieros
        WHERE reversal_of_id = v_charge.id
          AND movement_type = 'charge_reversal'
      ) THEN
        INSERT INTO public.reserva_movimientos_financieros (
          tenant_id, reserva_id, movement_type, amount, reversal_of_id,
          verification_status, notes, recorded_by, verified_by, verified_at
        )
        VALUES (
          NEW.tenant_id, NEW.id, 'charge_reversal', v_charge.amount, v_charge.id,
          'confirmed', 'Reversion automatica del cargo por cancelacion de la reserva',
          auth.uid(), auth.uid(), now()
        );
        UPDATE public.reservas
        SET account_charge_status = 'reversed'
        WHERE id = NEW.id;
      END IF;
    END IF;

    UPDATE public.reservas
    SET refund_status = CASE
      WHEN amount_paid > 0 THEN 'pending'
      ELSE 'not_applicable'
    END
    WHERE id = NEW.id
      AND payment_mode = 'prepaid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_reserva_cancellation_finances ON public.reservas;
CREATE TRIGGER trg_handle_reserva_cancellation_finances
AFTER UPDATE OF status ON public.reservas
FOR EACH ROW EXECUTE FUNCTION public.handle_reserva_cancellation_finances();

-- Marca explicitamente el cargo a cuenta cuando se crea.
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
    SET account_charged_at = COALESCE(account_charged_at, now()),
        account_charge_status = 'charged'
    WHERE id = NEW.id;
    PERFORM set_config('portho24.reserva_financial_write', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS reserva_movimientos_admin_insert
  ON public.reserva_movimientos_financieros;
CREATE POLICY reserva_movimientos_admin_insert
ON public.reserva_movimientos_financieros
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (SELECT public.current_user_tenant_id())
  AND (SELECT public.is_tenant_admin())
  AND movement_type IN ('refund','reversal','adjustment')
);

-- La app sube objetos privados; no se habilita lectura publica, update ni delete.
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;

COMMIT;

-- Notas:
-- * Al cancelar una reserva con cargo a cuenta, se crea un reverso enlazado al cargo original.
-- * Los pagos confirmados no se devuelven automáticamente; administración registra cada devolución.
-- * Los soportes se almacenan en el bucket privado reserva-soportes.
