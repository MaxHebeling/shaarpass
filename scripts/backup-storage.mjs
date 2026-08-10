#!/usr/bin/env node
/**
 * Backup del Storage de Supabase → disco.
 *
 * Los backups nativos de Supabase (plan Pro) cubren la BASE DE DATOS pero NO los
 * objetos del Storage (buckets). Este script cierra esa fuga: descarga TODOS los
 * objetos de todos los buckets a una carpeta local, con un manifest.json para
 * verificar. Súbela luego a donde guardes tus backups (Dropbox, S3, disco, etc.).
 *
 * Uso:
 *   node scripts/backup-storage.mjs [carpeta-destino]
 *   npm run backup:storage
 *
 * Requiere en el entorno (o en .env.local, que este script lee solo):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (para leer buckets privados y listar todo)
 *
 * No lleva secretos embebidos: lee del entorno en tiempo de ejecución.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// ── carga mínima de .env.local (sin dependencias) ────────────────────────────
async function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const txt = await readFile(p, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

await loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (env o .env.local).");
  process.exit(1);
}
// La service role es un JWT (eyJ…) o una clave sb_secret_…. Un placeholder o la
// anon/publishable no sirven para el API admin de Storage.
const looksReal = /^eyJ/.test(KEY) || /^sb_secret_/.test(KEY);
if (!looksReal || /REEMPLAZ|placeholder|your[-_]/i.test(KEY)) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY no parece una service role real (¿placeholder en .env.local?).\n" +
    "Cópiala de Supabase → Settings → API → service_role y córrelo como un one-off SIN dejarla en disco:\n" +
    "  SUPABASE_SERVICE_ROLE_KEY='<tu-service-role>' npm run backup:storage"
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = process.argv[2] || join(process.cwd(), "storage-backup", stamp);

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** Lista recursiva de un bucket: devuelve rutas de archivo (no carpetas). */
async function listAll(bucket, prefix = "") {
  const files = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Una "carpeta" no trae id/metadata; recursamos en ella.
      if (item.id === null || item.metadata == null) {
        files.push(...(await listAll(bucket, path)));
      } else {
        files.push({ path, size: Number(item.metadata?.size ?? 0) });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return files;
}

async function main() {
  const { data: buckets, error } = await db.storage.listBuckets();
  if (error) { console.error("listBuckets:", error.message); process.exit(1); }

  await mkdir(outDir, { recursive: true });
  const manifest = { stamp, url: URL, buckets: [] };
  let totalFiles = 0, totalBytes = 0, failures = 0;

  for (const b of buckets) {
    const files = await listAll(b.id);
    let bytes = 0;
    console.log(`\n📦 ${b.id} (${b.public ? "público" : "privado"}) — ${files.length} objeto(s)`);
    for (const f of files) {
      const { data: blob, error: dErr } = await db.storage.from(b.id).download(f.path);
      if (dErr || !blob) { console.error(`  ✗ ${f.path}: ${dErr?.message ?? "sin datos"}`); failures++; continue; }
      const dest = join(outDir, b.id, f.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from(await blob.arrayBuffer()));
      bytes += f.size;
      console.log(`  ✓ ${f.path} (${f.size} B)`);
    }
    manifest.buckets.push({ id: b.id, public: b.public, objects: files.length, bytes, files });
    totalFiles += files.length; totalBytes += bytes;
  }

  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\n────────────────────────────────────────`);
  console.log(`Backup en: ${outDir}`);
  console.log(`Buckets: ${buckets.length} · Objetos: ${totalFiles} · ${(totalBytes / 1e6).toFixed(2)} MB`);
  if (failures > 0) { console.error(`⚠️  ${failures} descarga(s) fallaron.`); process.exit(1); }
  console.log(`✅ Backup completo. Súbelo a tu destino de respaldo (Dropbox/S3/disco).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
