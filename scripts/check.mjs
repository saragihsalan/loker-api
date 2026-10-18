// Verifikasi site/ setelah build: jumlah file, JSON-LD valid, link internal utuh.
// Jalankan: npm run check (setelah npm run site / npm run update)
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = await walk(SITE);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f) => path.relative(SITE, f).split(path.sep).join('/');
console.log(`File total: ${files.length}, HTML: ${htmlFiles.length}`);

// 1. Jumlah detail == jumlah job di API copy.
const api = JSON.parse(await readFile(path.join(SITE, 'api', 'jobs.json'), 'utf8'));
const detailCount = htmlFiles.filter((f) => rel(f).startsWith('loker/')).length;
console.log(`Detail page: ${detailCount} vs job API: ${api.jobs.length} ${detailCount === api.jobs.length ? '✓' : '✗ BEDA!'}`);

// 2. Semua JSON-LD valid.
let ldCount = 0;
let ldErrors = 0;
for (const f of htmlFiles) {
  const html = await readFile(f, 'utf8');
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    ldCount++;
    try {
      JSON.parse(m[1]);
    } catch (e) {
      ldErrors++;
      console.error(`  JSON-LD rusak di ${rel(f)}: ${e.message}`);
    }
  }
}
console.log(`JSON-LD: ${ldCount} blok, ${ldErrors} error ${ldErrors ? '✗' : '✓'}`);

// 3. Crawl link internal — semua href/src root-relative harus ada filenya.
const targets = new Set();
for (const f of htmlFiles) {
  const html = await readFile(f, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    targets.add(m[1].split(/[?#]/)[0]);
  }
}
let broken = 0;
for (const t of [...targets].sort()) {
  const p = t.endsWith('/')
    ? path.join(SITE, t, 'index.html')
    : path.join(SITE, t);
  try {
    await stat(p);
  } catch {
    broken++;
    console.error(`  Link rusak: ${t}`);
  }
}
console.log(`Link internal unik: ${targets.size}, rusak: ${broken} ${broken ? '✗' : '✓'}`);

// 4. Sitemap: semua <loc> harus ada filenya.
const sm = await readFile(path.join(SITE, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
let smBroken = 0;
for (const loc of locs) {
  const p = new URL(loc).pathname;
  const file = p.endsWith('/') ? path.join(SITE, p, 'index.html') : path.join(SITE, p);
  try {
    await stat(file);
  } catch {
    smBroken++;
    console.error(`  Sitemap menunjuk file hilang: ${loc}`);
  }
}
console.log(`Sitemap URL: ${locs.length}, rusak: ${smBroken} ${smBroken ? '✗' : '✓'}`);

const fail = detailCount !== api.jobs.length || ldErrors || broken || smBroken;
console.log(fail ? '\n✗ ADA MASALAH — lihat di atas.' : '\n✓ Semua cek lolos.');
process.exit(fail ? 1 : 0);
