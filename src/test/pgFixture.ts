/**
 * Postgres real en memoria (PGlite/WASM) para probar migraciones SQL sin red.
 *
 * Carga un subconjunto fiel del esquema base (las tablas y funciones que tocan
 * las migraciones bajo prueba) + roles de Supabase (anon/authenticated/service_role)
 * y `auth.uid()` simulado vía `request.jwt.claim.sub`, para poder probar RLS.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const BASE_SCHEMA = /* sql */ `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
do $$ begin
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  created_at timestamptz not null default now());
create table public.org_members (
  org_id uuid not null references public.organizations(id), user_id uuid not null, role text not null
    check (role = any (array['owner','admin','staff','scanner'])),
  created_at timestamptz not null default now(), primary key (org_id, user_id));
create table public.events (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
  slug text not null, title text not null, status text not null default 'published',
  starts_at timestamptz not null default now(), ends_at timestamptz not null default now(), timezone text not null default 'America/Mexico_City');
create table public.ticket_types (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id), name text not null);
create table public.orders (
  id uuid primary key default gen_random_uuid(), event_id uuid references public.events(id), org_id uuid not null,
  buyer_email text not null, buyer_name text, buyer_phone text, buyer_city text,
  status text not null default 'pending' check (status = any (array['pending','paid','failed','refunded','cancelled','awaiting_payment'])),
  created_at timestamptz not null default now());
create table public.attendees (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  first_name text, last_name text, email text);
create table public.tickets (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  ticket_type_id uuid not null references public.ticket_types(id), event_id uuid not null references public.events(id),
  attendee_id uuid references public.attendees(id), qr_token text not null default encode(extensions.gen_random_bytes(12),'hex'),
  status text not null default 'valid' check (status = any (array['valid','checked_in','void','refunded'])),
  checked_in_at timestamptz, created_at timestamptz not null default now());

create function public.is_org_member(target_org uuid, min_roles text[] default array['owner','admin','staff','scanner'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m where m.org_id = target_org and m.user_id = auth.uid() and m.role = any(min_roles));
$$;
grant execute on function public.is_org_member(uuid, text[]) to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
-- Igual que Supabase: todo lo que se cree después concede EXECUTE/ALL a anon y authenticated.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

export async function createPgWithMigrations(files: string[]): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(BASE_SCHEMA);
  for (const f of files) await db.exec(readFileSync(MIGRATIONS_DIR + f, "utf8"));
  return db;
}

/** Ejecuta `fn` como un usuario autenticado (RLS activa) y vuelve a superusuario. */
export async function asUser<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${userId ?? ""}'; set role ${userId ? "authenticated" : "anon"};`);
  try { return await fn(); } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}
