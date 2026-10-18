// Orkestrator: fetch semua sumber → normalisasi → dedup → filter → tulis endpoint statis.
// Zero dependency. Satu sumber gagal TIDAK menggugurkan run (allSettled).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupe, envelope, ATTRIBUTION } from './lib.mjs';
import * as remoteok from './sources/remoteok.mjs';
import * as remotive from './sources/remotive.mjs';
import * as jobicy from './sources/jobicy.mjs';
import * as arbeitnow from './sources/arbeitnow.mjs';
import * as kalibrr from './sources/kalibrr.mjs';
import * as glints from './sources/glints.mjs';
import * as dealls from './sources/dealls.mjs';
import * as kitalulus from './sources/kitalulus.mjs';
import * as lokerbumn from './sources/lokerbumn.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'public', 'api');
const MIN_TOTAL = 100; // pengaman: bila agregat aneh kecil, gagalkan deploy

const SOURCES = [
  ['remoteok', remoteok.fetchJobs],
  ['remotive', remotive.fetchJobs],
  ['jobicy', jobicy.fetchJobs],
  ['arbeitnow', arbeitnow.fetchJobs],
  ['kalibrr', kalibrr.fetchJobs],
  ['glints', glints.fetchJobs],
  ['dealls', dealls.fetchJobs],
  ['kitalulus', kitalulus.fetchJobs],
  ['lokerbumn', lokerbumn.fetchJobs],
];

const generatedAt = new Date().toISOString();

// 1. Fetch paralel — sumber gagal = warning + lewati.
const results = await Promise.allSettled(SOURCES.map(([, fn]) => fn()));
const perSource = {};
let failedSources = 0;
results.forEach((r, i) => {
  const name = SOURCES[i][0];
  if (r.status === 'fulfilled') {
    perSource[name] = r.value;
    console.log(`✓ ${name}: ${r.value.length} job`);
  } else {
    failedSources++;
    perSource[name] = [];
    console.warn(`✗ ${name}: GAGAL dilewati — ${r.reason?.message || r.reason}`);
  }
});

// 2. Gabung, dedup, sort terbaru dulu.
const all = dedupe(Object.values(perSource).flat()).sort((a, b) =>
  (b.posted_at || '').localeCompare(a.posted_at || '')
);
console.log(`\nTotal setelah dedup: ${all.length} (gagal: ${failedSources} sumber)`);

// 3. Validasi — kalau terlalu kecil, jangan deploy data sampah.
if (all.length < MIN_TOTAL) {
  console.error(`FATAL: total ${all.length} < ${MIN_TOTAL}. Data tidak masuk akal — batal.`);
  process.exit(1);
}

// 4. Tulis semua endpoint statis.
await rm(API_DIR, { recursive: true, force: true });
await mkdir(path.join(API_DIR, 'source'), { recursive: true });
await mkdir(path.join(API_DIR, 'category'), { recursive: true });
await mkdir(path.join(API_DIR, 'country'), { recursive: true });

const write = (file, obj) => writeFile(path.join(API_DIR, file), JSON.stringify(obj));
const writePretty = (file, obj) => writeFile(path.join(API_DIR, file), JSON.stringify(obj, null, 2));

const byCategory = {};
const byCountry = {};
for (const job of all) {
  (byCategory[job.category] ??= []).push(job);
  (byCountry[job.country] ??= []).push(job);
}

await write('jobs.json', envelope(generatedAt, all));
await write('latest.json', envelope(generatedAt, all.slice(0, 100), { sort: 'latest', limit: 100 }));

for (const [source, jobs] of Object.entries(perSource)) {
  if (jobs.length) await write(`source/${source}.json`, envelope(generatedAt, jobs, { source }));
}
for (const [cat, jobs] of Object.entries(byCategory)) {
  await write(`category/${cat}.json`, envelope(generatedAt, jobs, { category: cat }));
}
for (const [country, jobs] of Object.entries(byCountry)) {
  await write(`country/${country.toLowerCase()}.json`, envelope(generatedAt, jobs, { country }));
}

const count = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.length]));
await writePretty('stats.json', {
  generated_at: generatedAt,
  total: all.length,
  sources_failed: failedSources,
  by_source: count(perSource),
  by_category: count(byCategory),
  by_country: count(byCountry),
});

await writePretty('index.json', {
  name: 'loker-api',
  description: 'API loker gratis & terupdate — aggregator 9 sumber (RemoteOK, Remotive, Jobicy, Arbeitnow, Kalibrr, Glints, Dealls, KitaLulus, Lokerbumn) dengan deskripsi lengkap + info perusahaan',
  generated_at: generatedAt,
  total: all.length,
  attribution: ATTRIBUTION,
  endpoints: {
    'jobs.json': 'Semua loker (sorted terbaru)',
    'latest.json': '100 loker terbaru',
    'stats.json': 'Statistik: jumlah per sumber/kategori/negara',
    'source/{name}.json': `Per sumber: ${Object.keys(perSource).join(', ')}`,
    'category/{name}.json': `Per kategori: ${Object.keys(byCategory).join(', ')}`,
    'country/{code}.json': `Per negara: ${Object.keys(byCountry).join(', ')}`,
  },
});

console.log(`\n✓ Selesai. ${all.length} job → ${path.relative(ROOT, API_DIR)} (gagal: ${failedSources} sumber)`);
