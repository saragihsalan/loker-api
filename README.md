# loker-api 🔍

API loker **gratis**, **selalu terupdate**, dan **set & forget**. Aggregator 5 sumber —
4 API resmi + Kalibrr (best-effort) — dijalankan otomatis tiap 2 jam oleh GitHub Actions
dan disajikan lewat GitHub Pages. **Biaya: $0. Tanpa server. Tanpa database.**

## Base URL

```
https://<username>.github.io/loker-api/api
```

(Ganti `<username>` dengan GitHub username Anda setelah repo di-push & Pages aktif.)

## Endpoint

| URL | Isi |
|---|---|
| `/api/jobs.json` | Semua loker (sorted terbaru) |
| `/api/latest.json` | 100 loker terbaru |
| `/api/stats.json` | Statistik jumlah per sumber/kategori/negara |
| `/api/source/{name}.json` | Per sumber: `remoteok`, `remotive`, `jobicy`, `arbeitnow`, `kalibrr` |
| `/api/category/{name}.json` | Per kategori: `tech`, `design`, `marketing`, `sales`, `support`, `finance`, `hr`, `content`, `data`, `operations`, `education`, `health`, `legal`, `other` |
| `/api/country/{code}.json` | Per negara: `id` (loker Indonesia), `global` |

## Contoh

```bash
# Ambil loker terbaru
curl https://<username>.github.io/loker-api/api/latest.json

# Cuma loker tech
curl https://<username>.github.io/loker-api/api/category/tech.json

# Cuma loker Indonesia
curl https://<username>.github.io/loker-api/api/country/id.json
```

Filter/pagination dilakukan sisi klien (muat `jobs.json`, filter di kode Anda) —
ini API statis, sengaja sesederhana mungkin agar bebas biaya selamanya.

## Skema job

```json
{
  "id": "a1b2c3d4e5f6…",
  "title": "Senior React Developer",
  "company": "Curtins",
  "location": "Remote",
  "country": "GLOBAL",
  "job_type": "Full-time",
  "category": "tech",
  "tags": ["react", "node"],
  "salary": { "min": 80000, "max": 100000, "currency": "USD" },
  "posted_at": "2026-10-17T08:00:50.000Z",
  "source": "remoteok",
  "url": "https://…",
  "excerpt": "Potongan deskripsi lowongan…"
}
```

Setiap response punya field `_attribution` berisi link ke sumber — **wajib dipertahankan**
(syarat ToS sumber data).

## Cara kerja

```
Cron GitHub Actions (tiap 2 jam)
  → scripts/update.mjs fetch 5 sumber paralel (gagal 1? dilewati, tetap jalan)
  → normalisasi + dedup + filter ≤30 hari
  → tulis public/api/*.json → commit → deploy GitHub Pages
```

- Sumber gagal tidak mematikan pipeline (Promise.allSettled).
- Kalau total job aneh kecil (<100), deploy dibatalkan supaya tidak menyebarkan data sampah.
- Retensi 30 hari — hanya loker segar yang dipublikasikan.

## Jalankan lokal

```bash
npm run update    # fetch + generate public/api/
npm run preview   # http://localhost:8788/api/stats.json
```

Butuh Node ≥ 18. **Tanpa `npm install`** — nol dependency, by design.

## Pasang di GitHub (sekali saja, 2 menit)

1. Buat repo baru (mis. `loker-api`), lalu push repo ini.
2. Settings → Pages → Source: **GitHub Actions**.
3. Selesai — cron jalan tiap 2 jam. Bisa juga di-trigger manual: tab **Actions** → **Refresh loker data** → **Run workflow**.

## Sumber data & atribusi

Data disediakan oleh — terima kasih kepada mereka ❤️:

- [RemoteOK](https://remoteok.com) — API resmi, syarat: link balik
- [Remotive](https://remotive.com) — API resmi, syarat: link balik
- [Jobicy](https://jobicy.com) — API resmi, syarat: kredit + link apply ke asal
- [Arbeitnow](https://arbeitnow.com) — API resmi, syarat: backlink
- [Kalibrr](https://www.kalibrr.com) — tanpa API resmi; diambil best-effort dari halaman publik. Kalau struktur situs berubah, sumber ini dilewati tanpa merusak API.

## Lisensi

MIT
