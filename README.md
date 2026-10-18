# loker-api 🔍

API loker **gratis**, **selalu terupdate**, dan **set & forget**. Aggregator 9 sumber —
4 API resmi global (RemoteOK, Remotive, Jobicy, Arbeitnow) + 5 sumber Indonesia
(Kalibrr, Glints, Dealls, KitaLulus, Lokerbumn, best-effort) — dijalankan otomatis tiap 2 jam oleh GitHub Actions
dan disajikan lewat GitHub Pages. **Biaya: $0. Tanpa server. Tanpa database.**

Data yang sama juga di-prarender jadi **website loker statis siap SEO** — 1.200+ halaman
HTML murni (homepage, detail, kategori, lokasi, perusahaan, sumber) yang dibundle jadi
ZIP siap upload ke hosting (mis. Hostinger `public_html`). Lihat
[Website loker statis → Hostinger](#website-loker-statis--hostinger).

Setiap loker menyertakan **deskripsi lengkap** + **info perusahaan** (logo, situs, industri,
deskripsi) dan bila tersedia **benefit, pendidikan, pengalaman, work mode, serta kontak**
(email/telepon) — bukan sekadar link redirect, jadi siap dipakai membangun web loker
dengan tampilan lengkap.

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
| `/api/source/{name}.json` | Per sumber: `remoteok`, `remotive`, `jobicy`, `arbeitnow`, `kalibrr`, `glints`, `dealls`, `kitalulus`, `lokerbumn` |
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
  "excerpt": "Potongan deskripsi lowongan…",
  "description": "Deskripsi lengkap (≤2000 char, bila tersedia dari sumber)",
  "company_info": { "logo": "https://…", "website": "https://…", "description": "Profil singkat perusahaan", "industry": "Fintech" },
  "benefits": ["Asuransi kesehatan", "THR"],
  "education": "Minimal S1",
  "experience": "2+ tahun",
  "work_mode": "Remote"
}
```

Field `description`, `company_info`, `benefits`, `education`, `experience`, dan `work_mode`
bersifat **opsional** (`null` kalau sumber tidak menyediakannya). Sumber Indonesia
(KitaLulus, Lokerbumn, Kalibrr) umumnya mengisi `description` penuh + `company_info`;
KitaLulus juga menyediakan `benefits`, `education`, `experience`, dan `work_mode`.
Lokerbumn menyertakan kontak (`email` / `telepon`) di `company_info` bila tertanam di posting —
jadi web loker bisa menampilkan info lengkap, bukan sekadar redirect.

Setiap response punya field `_attribution` berisi link ke sumber — **wajib dipertahankan**
(syarat ToS sumber data).

## Cara kerja

```
Cron GitHub Actions (tiap 2 jam)
  → scripts/update.mjs fetch 9 sumber paralel (gagal 1? dilewati, tetap jalan)
  → normalisasi + dedup + filter ≤30 hari
  → tulis public/api/*.json → commit → deploy GitHub Pages
  → scripts/build-site.mjs prarender site/ (1.200+ halaman HTML statis)
  → zip site/ → artifact "loker-site" (diunduh dari tab Actions → upload ke hosting)
```

- Sumber gagal tidak mematikan pipeline (Promise.allSettled).
- Kalau total job aneh kecil (<100), deploy dibatalkan supaya tidak menyebarkan data sampah.
- Retensi 30 hari — hanya loker segar yang dipublikasikan.

## Jalankan lokal

```bash
npm run update    # fetch + generate public/api/ + bangun site/
npm run site      # bangun ulang site/ saja dari data yang ada (tanpa fetch)
npm run check     # verifikasi site/: link utuh, JSON-LD valid, jumlah halaman cocok
npm run preview   # http://localhost:8788/ (website) & /api/stats.json (API)
```

Butuh Node ≥ 18. **Tanpa `npm install`** — nol dependency, by design.

## Pasang di GitHub (sekali saja, 2 menit)

1. Buat repo baru (mis. `loker-api`), lalu push repo ini.
2. Settings → Pages → Source: **GitHub Actions**.
3. Selesai — cron jalan tiap 2 jam. Bisa juga di-trigger manual: tab **Actions** → **Refresh loker data** → **Run workflow**.

## Website loker statis → Hostinger

Hasil build `site/` adalah HTML murni (tanpa framework, tanpa webfont, JS hanya di
halaman search) — **loading instan**, dan sudah lengkap SEO-nya:

- **JSON-LD**: `JobPosting` per detail + `WebSite`/`SearchAction` + `BreadcrumbList` + `Organization`
- Title & meta description unik, canonical absolut, Open Graph + Twitter card
- `sitemap.xml` (semua halaman + lastmod), `robots.txt`, `feed.xml` (20 terbaru)
- Breadcrumbs, `rel=next/prev`, H1 tunggal, internal linking kuat
- `/cari/` (search client-side) sengaja `noindex`
- `.htaccess` siap LiteSpeed: gzip, cache jauh (`1y`) untuk aset, `0` untuk HTML, 404 kustom

### Upload ke Hostinger (±1 menit)

1. GitHub repo → tab **Actions** → run terakhir → bagian **Artifacts** → unduh **`loker-site`** (ZIP, retensi 30 hari).
2. Hostinger **File Manager** → masuk `public_html`.
3. Upload ZIP → klik kanan → **Extract** — pastikan isinya langsung di root `public_html` (bukan subfolder).
4. Selesai, situs live. Ulangi tiap mau data terbaru — atau biarkan: run Actions tiap 2 jam selalu menyediakan ZIP baru.

### Ganti domain (saat domain sudah aktif)

Semua URL absolut (canonical, OG, sitemap, JSON-LD) berpusat di **satu baris** —
`scripts/site.config.mjs`:

```js
export const SITE_URL = 'https://example.com'; // ← ganti jadi domain asli, tanpa "/" di akhir
```

Lalu `npm run site` dan upload ulang ZIP-nya. Selama masih placeholder, Google menganggap
URL pakai `example.com` — jadi **ganti sebelum submit sitemap** di Search Console.

### Struktur output `site/`

| Halaman | Isi |
|---|---|
| `/` + `/page/N/` | feed utama, 20 loker/halaman, strip featured |
| `/loker/{slug}/` | detail: deskripsi penuh, benefit, info perusahaan, tombol lamar |
| `/kategori/{nama}/`, `/lokasi/{slug}/`, `/perusahaan/{slug}/`, `/sumber/{nama}/` | halaman grup + link balik ke sumber |
| `/cari/`, `/tentang/` | search client-side, profil + disclaimer |
| `/api/…` | salinan API — ikut hidup di domain sendiri |
| `sitemap.xml`, `robots.txt`, `feed.xml`, `404.html`, `.htaccess` | files root |

Repo tidak menyimpan HTML (`site/` di-gitignore) — ZIP artifact adalah kanal distribusi.

## Sumber data & atribusi

Data disediakan oleh — terima kasih kepada mereka ❤️:

- [RemoteOK](https://remoteok.com) — API resmi, syarat: link balik
- [Remotive](https://remotive.com) — API resmi, syarat: link balik
- [Jobicy](https://jobicy.com) — API resmi, syarat: kredit + link apply ke asal
- [Arbeitnow](https://arbeitnow.com) — API resmi, syarat: backlink
- [Kalibrr](https://www.kalibrr.com) — tanpa API resmi; diambil best-effort dari halaman publik. Kalau struktur situs berubah, sumber ini dilewati tanpa merusak API.
- [Glints](https://glints.com) — tanpa API resmi; best-effort dari halaman publik (30 loker Indonesia terbaru).
- [Dealls](https://dealls.com) — tanpa API resmi; best-effort dari halaman publik (18 loker Indonesia terbaru).
- [KitaLulus](https://www.kitalulus.com) — GraphQL publik (persisted query); 25–30 loker Indonesia terbaru dengan deskripsi lengkap, benefit, dan info perusahaan.
- [Lokerbumn](https://lokerbumn.com) — WordPress REST API resmi; 47 loker BUMN/instansi terbaru dengan deskripsi penuh + kontak.

## Lisensi

MIT
