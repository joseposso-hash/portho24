# Mantenimiento automático de Supabase

El workflow `.github/workflows/supabase-keepalive.yml` envía una consulta REST de solo lectura a la tabla `tenants` cuatro veces al día. No inserta, modifica ni elimina información operativa.

## Configuración requerida en GitHub

En el repositorio, abre **Settings → Secrets and variables → Actions → New repository secret** y crea:

- `NEXT_PUBLIC_SUPABASE_URL`: el valor de la variable homónima configurada en Vercel.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: el valor de la variable homónima configurada en Vercel.

Usar únicamente la clave pública anon/publishable. **Nunca** configurar `service_role`, una clave secreta de Supabase ni credenciales de administrador.

## Activación y prueba

Después de guardar los dos secretos, abre **Actions → Supabase keep-alive → Run workflow** para ejecutar una prueba manual. Revisa que el job termine correctamente y reporte HTTP 200. Las ejecuciones programadas se realizan cada seis horas (UTC).

Esta rutina genera actividad real mediante la API de base de datos, pero Supabase no garantiza que una frecuencia concreta evite la pausa de todos los proyectos Free. Para eliminar la pausa automática por inactividad, el proyecto debe estar en un plan de pago.
