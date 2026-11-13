-- Portho24: notificaciones centralizadas para los módulos del residente.
-- Aplicar una sola vez en Supabase SQL Editor sobre el proyecto Portho24.
-- No modifica registros existentes ni cambia las políticas RLS.
-- Usa resident_notifications.item_id = NULL para módulos distintos de Correspondencia,
-- porque esa columna conserva su FK actual hacia correspondence_items.

BEGIN;

-- 1. Paquetería: avisar a los residentes activos de la casa al recibir un paquete.
CREATE OR REPLACE FUNCTION public.notify_resident_package_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.recipient_unit_id IS NULL
     OR NEW.status::text NOT IN ('received', 'notified') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.resident_notifications (
    tenant_id, unit_id, user_id, item_id,
    notification_type, title, message
  )
  SELECT
    NEW.tenant_id,
    NEW.recipient_unit_id,
    u.id,
    NULL,
    'package',
    'Paquete recibido',
    'La portería registró un paquete de ' || COALESCE(NEW.courier, 'un proveedor')
      || '. Ingresa a Paquetería para consultar el PIN de retiro.'
  FROM public.users u
  WHERE u.tenant_id = NEW.tenant_id
    AND u.unit_id = NEW.recipient_unit_id
    AND u.role::text = 'resident'
    AND u.is_active = true;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_resident_package_received() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_notify_resident_package_received ON public.packages;
CREATE TRIGGER trg_notify_resident_package_received
AFTER INSERT ON public.packages
FOR EACH ROW
EXECUTE FUNCTION public.notify_resident_package_received();


-- 2. Parqueadero: avisar al residente responsable cuando requiere autorizar un cobro.
CREATE OR REPLACE FUNCTION public.notify_resident_parking_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.payer_type = 'resident'
     AND NEW.payer_user_id IS NOT NULL
     AND NEW.unit_id IS NOT NULL
     AND NEW.amount_due > 0
     AND NEW.charge_authorization_status = 'pending'
     AND (
       TG_OP = 'INSERT'
       OR OLD.charge_authorization_status IS DISTINCT FROM NEW.charge_authorization_status
       OR OLD.payer_user_id IS DISTINCT FROM NEW.payer_user_id
       OR OLD.amount_due IS DISTINCT FROM NEW.amount_due
       OR OLD.payer_type IS DISTINCT FROM NEW.payer_type
     ) THEN

    INSERT INTO public.resident_notifications (
      tenant_id, unit_id, user_id, item_id,
      notification_type, title, message
    )
    SELECT
      NEW.tenant_id,
      NEW.unit_id,
      u.id,
      NULL,
      'parking',
      'Autorización de parqueadero pendiente',
      'Hay un cobro de parqueadero pendiente de tu autorización. Ingresa al módulo Parqueadero para revisar el valor y responder.'
    FROM public.users u
    WHERE u.id = NEW.payer_user_id
      AND u.tenant_id = NEW.tenant_id
      AND u.unit_id = NEW.unit_id
      AND u.role::text = 'resident'
      AND u.is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_resident_parking_authorization() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_notify_resident_parking_authorization ON public.parking_sessions;
CREATE TRIGGER trg_notify_resident_parking_authorization
AFTER INSERT OR UPDATE OF charge_authorization_status, payer_user_id, amount_due, payer_type
ON public.parking_sessions
FOR EACH ROW
EXECUTE FUNCTION public.notify_resident_parking_authorization();


-- 3. Visitas: avisar cuando portería registra ingreso, salida, rechazo o vencimiento.
CREATE OR REPLACE FUNCTION public.notify_resident_visit_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_visitor_name text;
  v_title text;
  v_message text;
BEGIN
  IF NEW.status::text IS NOT DISTINCT FROM OLD.status::text
     OR NEW.host_user_id IS NULL
     OR NEW.unit_id IS NULL
     OR NEW.status::text NOT IN ('checked_in', 'checked_out', 'denied', 'expired') THEN
    RETURN NEW;
  END IF;

  SELECT v.full_name
  INTO v_visitor_name
  FROM public.visitors v
  WHERE v.id = NEW.visitor_id
    AND v.tenant_id = NEW.tenant_id;

  v_title := CASE NEW.status::text
    WHEN 'checked_in' THEN 'Tu visitante ingresó'
    WHEN 'checked_out' THEN 'Tu visitante salió'
    WHEN 'denied' THEN 'Visita rechazada'
    WHEN 'expired' THEN 'Autorización de visita vencida'
    ELSE 'Actualización de visita'
  END;

  v_message := CASE NEW.status::text
    WHEN 'checked_in' THEN COALESCE(v_visitor_name, 'Tu visitante') || ' ingresó al conjunto.'
    WHEN 'checked_out' THEN COALESCE(v_visitor_name, 'Tu visitante') || ' registró su salida del conjunto.'
    WHEN 'denied' THEN 'La visita de ' || COALESCE(v_visitor_name, 'tu invitado') || ' fue rechazada en portería.'
    WHEN 'expired' THEN 'La autorización de ' || COALESCE(v_visitor_name, 'tu invitado') || ' venció.'
    ELSE 'La visita tuvo una actualización.'
  END;

  INSERT INTO public.resident_notifications (
    tenant_id, unit_id, user_id, item_id,
    notification_type, title, message
  )
  SELECT
    NEW.tenant_id, NEW.unit_id, u.id, NULL,
    'visit', v_title, v_message
  FROM public.users u
  WHERE u.id = NEW.host_user_id
    AND u.tenant_id = NEW.tenant_id
    AND u.unit_id = NEW.unit_id
    AND u.role::text = 'resident'
    AND u.is_active = true;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_resident_visit_status() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_notify_resident_visit_status ON public.visits;
CREATE TRIGGER trg_notify_resident_visit_status
AFTER UPDATE OF status ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.notify_resident_visit_status();


-- 4. Reservas: avisar al hogar cuando administración aprueba o rechaza.
CREATE OR REPLACE FUNCTION public.notify_resident_reservation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_area_name text;
  v_message text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.unit_id IS NULL
     OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT a.name
  INTO v_area_name
  FROM public.areas_comunes a
  WHERE a.id = NEW.area_id;

  v_message := 'Tu reserva de ' || COALESCE(v_area_name, 'un área común')
    || ' para el ' || to_char(NEW.date, 'DD/MM/YYYY')
    || CASE
      WHEN NEW.status = 'approved' THEN ' fue aprobada.'
      ELSE ' fue rechazada.'
    END;

  IF NEW.admin_notes IS NOT NULL AND btrim(NEW.admin_notes) <> '' THEN
    v_message := v_message || ' Observación: ' || left(NEW.admin_notes, 500);
  END IF;

  INSERT INTO public.resident_notifications (
    tenant_id, unit_id, user_id, item_id,
    notification_type, title, message
  )
  SELECT
    NEW.tenant_id,
    NEW.unit_id,
    u.id,
    NULL,
    'reservation',
    CASE WHEN NEW.status = 'approved' THEN 'Reserva aprobada' ELSE 'Reserva rechazada' END,
    v_message
  FROM public.users u
  WHERE u.tenant_id = NEW.tenant_id
    AND u.unit_id = NEW.unit_id
    AND u.role::text = 'resident'
    AND u.is_active = true;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_resident_reservation_status() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_notify_resident_reservation_status ON public.reservas;
CREATE TRIGGER trg_notify_resident_reservation_status
AFTER UPDATE OF status ON public.reservas
FOR EACH ROW
EXECUTE FUNCTION public.notify_resident_reservation_status();


-- 5. PQRS: avisar al hogar cuando hay respuesta o cambia el estado de seguimiento.
CREATE OR REPLACE FUNCTION public.notify_resident_pqrs_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_message text;
BEGIN
  IF NEW.unit_id IS NULL
     OR (
       NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.response IS NOT DISTINCT FROM OLD.response
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.response IS DISTINCT FROM OLD.response
     AND NEW.response IS NOT NULL
     AND btrim(NEW.response) <> '' THEN
    v_message := 'La administración respondió tu solicitud "' || NEW.subject || '": '
      || left(NEW.response, 800);
  ELSE
    v_message := 'Tu solicitud "' || NEW.subject || '" cambió de estado a '
      || CASE NEW.status
        WHEN 'pending' THEN 'Pendiente.'
        WHEN 'in_progress' THEN 'En proceso.'
        WHEN 'resolved' THEN 'Resuelta.'
        ELSE NEW.status || '.'
      END;
  END IF;

  INSERT INTO public.resident_notifications (
    tenant_id, unit_id, user_id, item_id,
    notification_type, title, message
  )
  SELECT
    NEW.tenant_id,
    NEW.unit_id,
    u.id,
    NULL,
    'pqrs',
    'Actualización de tu PQRS',
    v_message
  FROM public.users u
  WHERE u.tenant_id = NEW.tenant_id
    AND u.unit_id = NEW.unit_id
    AND u.role::text = 'resident'
    AND u.is_active = true;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_resident_pqrs_update() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_notify_resident_pqrs_update ON public.pqrs;
CREATE TRIGGER trg_notify_resident_pqrs_update
AFTER UPDATE OF status, response ON public.pqrs
FOR EACH ROW
EXECUTE FUNCTION public.notify_resident_pqrs_update();


-- 6. Comunicados: avisar a todos los residentes activos del conjunto.
CREATE OR REPLACE FUNCTION public.notify_resident_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.resident_notifications (
    tenant_id, unit_id, user_id, item_id,
    notification_type, title, message
  )
  SELECT
    NEW.tenant_id,
    u.unit_id,
    u.id,
    NULL,
    'announcement',
    'Nuevo comunicado: ' || NEW.title,
    left(NEW.content, 1000)
  FROM public.users u
  WHERE u.tenant_id = NEW.tenant_id
    AND u.unit_id IS NOT NULL
    AND u.role::text = 'resident'
    AND u.is_active = true;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_resident_announcement() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_notify_resident_announcement ON public.comunicados;
CREATE TRIGGER trg_notify_resident_announcement
AFTER INSERT ON public.comunicados
FOR EACH ROW
EXECUTE FUNCTION public.notify_resident_announcement();


-- 7. Permisos de ejecución de las funciones de trigger.
REVOKE ALL ON FUNCTION public.notify_resident_package_received() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_resident_parking_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_resident_visit_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_resident_reservation_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_resident_pqrs_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_resident_announcement() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_resident_package_received() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_resident_parking_authorization() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_resident_visit_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_resident_reservation_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_resident_pqrs_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_resident_announcement() TO service_role;

COMMIT;
