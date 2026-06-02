# PLAN — Mapeo Realista de Recintos para Ticketera

> Estado: **propuesta para aprobación**. No se implementa hasta tu OK.
> Autor: The Architect · Fecha: 2026-06-01

---

## 0. Contexto: qué YA existe (no se reconstruye)

Ticketera ya tiene el motor de ventas funcionando y verificado:

- **Ventas**: `events`, `ticket_types`, `orders`, `order_items`, `tickets` (QR), checkout con Stripe Connect, webhook, reembolsos.
- **Reserva temporal**: `ticket_holds` (GA) y `seats` con `hold_seats`/`release_expired_seats` + pg_cron (asientos).
- **Reserved seating MVP**: tabla `seats` (grilla `pos_x`/`pos_y`, status available/held/sold), `generate_seats`, `confirm_order_paid`/`refund_order` conscientes de asientos, `SeatBuilder` (admin) y `SeatMap` (comprador, grilla simple).
- **Realtime, auth, RLS, pagos, emails** — listos.

**Conclusión:** este proyecto NO arranca de cero. Es una **evolución** del módulo de asientos actual (grilla básica) hacia mapas geométricos a escala. El `seats` actual se migra, no se desecha.

---

## 1. Alcance del nuevo sistema

Convertir cualquier recinto (teatro, salón, cancha, estadio, mega-venue) en un **mapa digital a escala** donde el comprador elige su ubicación exacta sobre un plano hiperrealista.

5 módulos pedidos → mapeados a la base existente:

| # | Módulo | Estado base | Trabajo nuevo |
|---|--------|-------------|---------------|
| 1 | Captura/digitalización (CV/fotogrametría) | ❌ no existe | **Lo más difícil.** Pipeline asistido (ver §6) |
| 2 | Editor de mapas (admin) | ⚠️ grilla simple | Editor geométrico: zonas/polígonos, filas curvas, nomenclatura configurable |
| 3 | Mapa interactivo de venta | ⚠️ grilla SVG simple | Render con LOD (zonas→asientos), zoom/pan, escala a miles, realtime |
| 4 | Motor de ventas (carrito, lock, checkout, QR) | ✅ existe | Adaptar a zonas + asientos geométricos |
| 5 | Servicios del evento (extras) | ❌ no existe | Catálogo de add-ons en el checkout |

---

## 2. Stack propuesto y justificación

**Mantener el stack base** (Next.js 16 + Supabase + Stripe) y añadir piezas específicas:

### 2.1 Base de datos — Postgres + **PostGIS**
- Habilitar **PostGIS** (disponible en Supabase) para geometría real: zonas como `POLYGON`, asientos como `POINT`, en un sistema de coordenadas del recinto (metros).
- *Por qué:* permite consultas espaciales (¿qué asientos hay en este polígono?), cálculo de capacidad por área, y guardar la geometría una sola vez con precisión. Evita reinventar geometría en JSON suelto.
- Realtime de disponibilidad: **Supabase Realtime** con estrategia por sección (§5), no broadcast de 50k asientos.

### 2.2 Render del mapa — **tres niveles según tamaño** (Level-of-Detail)
El error clásico es renderizar 40k nodos SVG → el navegador muere. Estrategia por capas:

- **Nivel macro (siempre):** vista de **zonas/secciones** como polígonos (SVG o Canvas). Ligero aunque el estadio tenga 80k asientos.
- **Nivel micro (al hacer zoom a una sección):** se cargan y renderizan **solo los asientos de esa sección**.
- **Motor de render por escala:**
  - Pequeño/mediano (≤ ~3k asientos visibles): **SVG** + `react-zoom-pan-pinch` (simple, accesible, hover nativo).
  - Grande/mega (canchas, estadios): **Canvas/WebGL** con **PixiJS** (o `react-konva` para canvas 2D). Maneja decenas de miles de sprites a 60fps.
- *Por qué no solo SVG:* SVG es cómodo pero se cae arriba de ~5-10k elementos. PixiJS/WebGL es el estándar de la industria (Ticketmaster, AXS) para venues grandes.

### 2.3 Captura/CV — **microservicio Python aparte** (no en el serverless de Next)
- Servicio Python (FastAPI) con **OpenCV** para detección de líneas/contornos/grillas en planos, + **modelo de visión** (Claude vision o un detector) para sugerir filas/asientos. Corre como contenedor (Railway/Fly/Render) o función pesada — NO en Vercel (límites de CPU/tiempo).
- *Por qué aparte:* fotogrametría/CV es CPU-intensivo y con dependencias nativas; no cabe en el runtime de Next. Se comunica por API + Supabase Storage.

### Resumen de adiciones al stack
`PostGIS` · `PixiJS` (+ `@pixi/react`) y/o `react-konva` · `react-zoom-pan-pinch` · microservicio `FastAPI + OpenCV` · Supabase Storage (planos/imágenes).

---

## 3. Reordenamiento propuesto de módulos (importante)

Pediste captura (módulo 1) primero, pero **arquitectónicamente la captura es lo último que debe construirse**, porque solo *alimenta* al editor y al modelo de datos. Propongo:

```
Datos+geometría → Editor (manual) → Mapa de venta (LOD+realtime) → Servicios → CAPTURA/CV (asistida)
       Fase 1          Fase 2              Fase 3                  Fase 4         Fase 5
```

Razón: con el editor manual + render ya tienes un producto **vendible y demostrable** para cualquier recinto (capturándolo a mano o desde un plano). La CV solo acelera la captura; construirla primero es alto riesgo sin nada que mostrar. (Si prefieres el orden literal del prompt, lo respeto — ver §9 decisiones.)

---

## 4. Esquema de datos (conceptual)

Evoluciona el `seats` actual. Nuevas tablas:

```
venues                 -- recinto físico (reutilizable entre eventos)
  id, org_id, name, address, city, capacity, srid/units

venue_maps             -- un mapa versionado de un venue (puede haber varios layouts)
  id, venue_id, name, status(draft/published), width_m, height_m, background_image_url, version

zones                  -- secciones/bloques/gradas (nomenclatura configurable)
  id, map_id, name, kind('seated'|'ga'|'table'|'standing'),
  geometry(POLYGON, PostGIS), color, capacity (para GA), display_order

rows                   -- filas dentro de una zona seated (rectas o curvas)
  id, zone_id, label, curve(jsonb opcional)

venue_seats            -- asiento individual con coordenada real (evoluciona `seats`)
  id, map_id, zone_id, row_id, label, point(POINT, PostGIS), pos_x_m, pos_y_m, rotation

-- En venta, por evento:
event_maps             -- liga un evento a un venue_map + estado de venta
  id, event_id, map_id
event_zone_pricing     -- precio por zona en ese evento (zona → ticket_type/precio)
  id, event_id, zone_id, ticket_type_id, price_cents
event_seats            -- estado de venta por asiento EN ESE evento (status/hold/order)
  id, event_id, venue_seat_id, status, hold_session, hold_expires_at, order_id

services / event_services   -- extras (comida, parking, merch, VIP, accesos)
  id, event_id, name, kind, price_cents, inventory, max_per_order
order_services              -- add-ons comprados en una orden
  id, order_id, service_id, quantity, unit_price_cents
```

**Decisión clave:** separar **geometría del recinto** (`venue_*`, reusable) del **estado de venta por evento** (`event_seats`). Así un mismo estadio sirve para 100 eventos sin duplicar el mapa. El `seats` actual ≈ `event_seats` de hoy; se migra.

---

## 5. Realtime de disponibilidad a escala

No se puede suscribir a 50k filas. Estrategia:
- **Contadores por zona** (`event_zone_pricing.sold/available` o vista materializada) → el mapa macro muestra "Zona A: 230 disponibles" en realtime barato.
- **Per-asiento solo al abrir una sección:** al hacer zoom, se hace fetch del estado de esa zona y se abre un canal Realtime filtrado por `zone_id`. Al salir, se cierra.
- Locks con expiración (ya existe el patrón `hold_seats` + pg_cron) extendido a `event_seats`.

---

## 6. Captura/digitalización — enfoque honesto

"Generar un mapa a escala desde fotos" automáticamente y con precisión es **research-grade**; prometerlo mágico sería deshonesto. Propongo un pipeline **asistido, human-in-the-loop**, en 3 niveles de ambición (incrementales):

- **Nivel A — Import desde plano (lo más fiable):** el admin sube un plano/imagen/PDF del recinto. Fija una **referencia de escala** (marca una medida conocida, ej. "esta línea = 10 m") → calibra px→metros. Luego traza zonas sobre el plano. **Esto cubre el 90% de los casos reales.**
- **Nivel B — CV-asistida:** sobre ese plano, OpenCV detecta líneas/contornos y un modelo de visión sugiere grillas de asientos/filas; el admin acepta/ajusta. Reduce el trabajo manual, no lo elimina.
- **Nivel C — Fotogrametría 3D (opcional, futuro):** reconstrucción desde múltiples fotos/video. Alto costo/complejidad; solo si un cliente lo justifica.

Empezamos por **A** (entregable real), B como mejora, C como I+D.

---

## 7. Plan por fases (incremental y verificable)

Cada fase termina con algo demostrable y, donde aplique, auditable con `/ln-620`.

- **Fase 1 — Geometría + datos.** PostGIS on; tablas `venues`/`venue_maps`/`zones`/`venue_seats`/`event_*`/`services`; migrar `seats`→nuevo modelo; RPCs de lock por evento. *Entregable: esquema aplicado + test de capacidad/lock.*
- **Fase 2 — Editor de mapas (admin).** Lienzo para dibujar zonas (polígonos), generar filas/asientos (rectas y curvas), nomenclatura configurable, fondo de plano. *Entregable: crear un mapa de teatro y uno de "cancha" a mano.*
- **Fase 3 — Mapa de venta (LOD + realtime).** Reemplaza `SeatMap` por el render por niveles (zonas→asientos), zoom/pan, disponibilidad en vivo, precios por zona, selección → carrito. SVG para chico, PixiJS para grande. *Entregable: comprar en un venue de ~10k asientos fluido.*
- **Fase 4 — Servicios/extras.** Catálogo configurable + integración en checkout (y en el email/QR). *Entregable: comprar asiento + estacionamiento + merch en una orden.*
- **Fase 5 — Captura asistida (Nivel A→B).** Microservicio CV + flujo de import desde plano con calibración de escala; luego sugerencias CV. *Entregable: subir un plano y generar zonas/asientos semi-automático.*
- **Fase 6 — Hardening de escala.** Tiling, virtualización, pruebas con venue de 50k+, perf 60fps, auditoría de seguridad/queries.

---

## 8. Riesgos

- **Render a escala** (mega-venues): mitigado con LOD + WebGL desde el diseño.
- **Precisión de CV**: mitigada haciéndola asistida, no autónoma (Nivel A primero).
- **Microservicio Python**: nueva pieza de infra/despliegue (costo + ops).
- **Complejidad geométrica del editor** (filas curvas, gradas): es el módulo más laborioso de UI.
- **Migración de `seats` actual** sin romper el reserved-seating ya verificado.

---

## 9. Decisiones FIJADAS (2026-06-01)

1. **Orden:** ✅ Editor + venta primero; captura/CV al final (Fase 5).
2. **Captura:** ✅ **Nivel A** (import desde plano + calibración de escala). **NO** microservicio Python en el MVP → se pospone CV (Nivel B) a una fase futura.
3. **Escala objetivo:** ✅ **Estadio completo (50k+).** Esto **obliga** WebGL (PixiJS) + tiling + virtualización **desde el diseño**, no como optimización posterior.
4. **Secuencia:** ✅ Recintos primero; **Gap #5** (email marketing + waitlist) después.

### Impacto de las decisiones en el stack
- **Se elimina del MVP** el microservicio FastAPI/OpenCV. La captura Nivel A es 100% en el cliente/Next (subir imagen → calibrar → trazar). Storage en Supabase.
- **Render = WebGL obligatorio** para el mapa de venta: **PixiJS** (`@pixi/react`) con LOD (zonas en macro, asientos por tile al zoom) + culling de viewport. SVG queda solo para el editor de zonas (pocos polígonos) y previews.
- **Tiling de asientos:** los asientos de una zona se cargan/renderizan por viewport, no todos a la vez. Contadores de disponibilidad por zona vía vista materializada + Realtime; per-asiento solo en la zona abierta.

### Fase 1 concreta (lo que arranca al aprobar)
1. Habilitar **PostGIS**.
2. Crear tablas: `venues`, `venue_maps`, `zones` (POLYGON), `rows`, `venue_seats` (POINT), `event_maps`, `event_zone_pricing`, `event_seats`, `services`, `event_services`, `order_services`.
3. **Migrar** el `seats` actual → `venue_seats` + `event_seats` sin romper el reserved-seating ya verificado.
4. RPCs: `hold_event_seats`, `release_expired_event_seats` (pg_cron), y adaptar `confirm_order_paid`/`refund_order` al nuevo modelo por evento.
5. Vista materializada de disponibilidad por zona + trigger de refresco.
6. RLS de las nuevas tablas (lectura pública de mapas publicados; escritura solo org).
*Entregable verificable: esquema aplicado + test de lock/capacidad + migración del teatro existente al nuevo modelo.*

---

> **Plan finalizado con tus decisiones. Esperando tu "arranca la Fase 1" para implementar.**
