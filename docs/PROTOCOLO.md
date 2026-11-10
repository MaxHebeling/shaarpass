# Módulo de Gestión de Asistentes, Cobertura Pastoral y Protocolo

Ampliación **exclusiva por tenant** (hoy solo *Ministerio Internacional Fuente de Vida*).
Las demás organizaciones no ven, no ejecutan y no pueden escribir nada de este módulo.

## Cómo se aísla

| Capa | Mecanismo |
|---|---|
| Tenant | `org_features (org_id, 'protocol')`. La migración lo habilita **por slug real** (`ministerio-internacional-fuente-de-vida-0530b4`). |
| Evento | `protocol_event_settings.enabled` — cada evento se activa a mano; nada se activa solo. |
| Base de datos | Triggers `protocol_guard_scope`: toda fila `protocol_*` debe tener el `org_id` real del evento **y** el feature. Imposible crear datos para otro tenant aunque el servidor se equivoque. |
| RLS | Lectura solo para `owner/admin/staff` de la org dueña con el feature. Sin políticas de escritura: se escribe solo desde el servidor (service role) tras resolver tenant y rol. `protocol_orders` (tokens) solo `owner/admin`. |
| API | `resolveProtocolAccess()` deriva el tenant del evento en BD (nunca del navegador). No miembro / sin feature → **404** (no filtra existencia). Cada id recibido se re-filtra por `event_id`. |
| UI | El botón “Asistentes y protocolo” y la ruta `/dashboard/eventos/[id]/protocolo` solo existen con el feature. El enlace en el correo solo aparece si el evento tiene el módulo activo. |

## Roles

| Acción | owner/admin | staff | scanner | comprador |
|---|---|---|---|---|
| Ver panel / directorio | ✓ | ✓ | — | — |
| Editar asistentes y confirmaciones | ✓ | ✓ (no tras check-in) | — | Solo los suyos, antes de la fecha límite y del check-in |
| Validar cobertura pastoral | ✓ | — | — | — |
| Invitados especiales sin compra | ✓ | — | — | — |
| Crear comidas / invitar | ✓ | solo confirmar | — | — |
| Mesas | ✓ (puede exceder capacidad con confirmación) | ✓ (sin exceder) | — | — |
| Configuración, exportar, bitácora, enlace del comprador | ✓ | — | — | — |
| Check-in | (escáner existente) | | ✓ ve acceso/brazalete/mesa | — |

## Flujo del comprador

1. Compra igual que siempre (checkout, Stripe/Mercado Pago, `confirm_order_paid` **sin cambios**).
2. Al confirmarse el pago, `protocol_sync_order` crea (idempotente) un registro por boleto; el 1.º se precarga con el comprador.
3. El correo de boletos incluye “Registrar asistentes” → `/asistentes/{token}` (token de 256 bits, solo su compra).
4. Puede completar/sustituir acompañantes sin recomprar; se conserva boleto, folio, pago y bitácora.

## Uso administrativo (para la secretaria/organizadora)

1. Evento → **Asistentes y protocolo** → *Configuración*: activar módulo y elegir funciones (comidas, mesas, fecha límite…).
2. *Directorio*: filtros, búsqueda, editar, **validar cobertura** (escudo), copiar el enlace del comprador para WhatsApp.
3. *Comidas*: crear comida → invitar personas → marcar confirmados, acompañantes autorizados y brazalete.
4. *Mesas*: crear mesas con capacidad y reservados → asignar/mover; “Sugerir acomodo” propone sin aplicar.
5. *Reportes*: Excel (CSV) o Imprimir/PDF; tarjetas con nombres por mesa.

## Despliegue

1. Aplicar `supabase/migrations/0013_protocol_module.sql` (aditiva; no modifica tablas/funciones existentes).
2. Desplegar el código. Sin la migración el código no rompe nada: todas las llamadas al módulo fallan en silencio y el flujo actual sigue igual (probado).
3. Activar el módulo en el evento desde el panel.

## Rollback

- **Instantáneo, sin borrar datos:** `update org_features set enabled=false where feature='protocol';`
- Por evento: apagar “Módulo activo” en Configuración.
- Completo: `supabase/rollback/0013_protocol_module_down.sql` (solo objetos `protocol_*` y `org_features`).

## Pruebas

- `src/lib/protocol/migration.db.test.ts` — Postgres real (PGlite): aislamiento, RLS entre tenants, idempotencia, un boleto = una persona, cobertura, capacidad de mesas, duplicados, bitácora.
- `src/app/api/protocol/**/route.test.ts` — rutas manipuladas: otro tenant, ids de otro evento, roles, check-in, fecha límite, reembolsos, inyección CSV.
- `src/app/api/webhooks/stripe/route.test.ts` y `src/app/api/checkin/staff/route.test.ts` — regresión: otros tenants reciben exactamente la misma respuesta/correo.
