# Migraciones archivadas (pre-baseline)

Estas 49 migraciones fragmentadas (0001-0052) quedaron **archivadas** el 2026-08-10.
Varias eran *stubs* (solo comentarios) y faltaban 0010/0011 (tabla `seats`), así que el
conjunto **no reproducía prod desde cero**.

El esquema real de producción se capturó con `pg_dump` y vive ahora en
`supabase/migrations/0000_baseline.sql` (snapshot fiel: 42 tablas, 56 funciones,
50 políticas, grants, extensiones, buckets de Storage y cron).

Se conservan aquí solo como referencia histórica. **No se aplican.**
Los cambios futuros van como nuevas migraciones numeradas después del baseline.
