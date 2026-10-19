// Generator website statis dari public/api/jobs.json — prarender penuh
// (HTML siap saji, tanpa JS render) biar loading instan & SEO kuat.
// Jalankan: node scripts/build-site.mjs (atau: npm run site)
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAME, SITE_URL, TAGLINE, PER_PAGE, LOKASI_MIN, PERUSAHAAN_MIN, TRENDING_DAYS } from './site.config.mjs';
import { ATTRIBUTION } from './lib.mjs';
import { makeOgPNG } from './make-og.mjs';
import * as R from './render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = path.join(ROOT, 'site');
const STATIC_DIR = path.join(ROOT, 'static');
const API_DIR = path.join(ROOT, 'public', 'api');

const push = (m, k, v) => {
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(v);
};
const genDate = (iso) => (iso ? iso.slice(0, 10) : '');

/** Tag paling sering muncul N hari terakhir → widget "Trending Sepekan". */
function trendingTags(jobs, days) {
  const since = Date.now() - days * 86_400_000;
  const freq = new Map();
  for (const j of jobs) {
    if (j.posted_at && Date.parse(j.posted_at) < since) continue;
    for (const t of (j.tags || []).slice(0, 5)) freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

export async function buildSite(jobsInput, generatedAt) {
  const t0 = Date.now();
  const jobs = [...jobsInput].sort((a, b) => (b.posted_at || '').localeCompare(a.posted_at || ''));
  await rm(SITE_DIR, { recursive: true, force: true });
  await mkdir(SITE_DIR, { recursive: true });

  const write = async (rel, content) => {
    const file = path.join(SITE_DIR, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  };

  // ── 1. Slug unik per job ──
  const slugs = new Map();
  const used = new Set();
  for (const job of jobs) {
    const base = R.slugify(`${job.title}-${job.company}`);
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${job.id.slice(0, 6)}-${n++}`;
    used.add(slug);
    slugs.set(job.id, slug);
  }

  // ── 2. Pengelompokan ──
  const byCat = new Map();
  const byLoc = new Map();
  const byComp = new Map();
  const bySource = new Map();
  const locLabels = new Map();
  const compLabels = new Map();
  for (const job of jobs) {
    push(byCat, job.category, job);
    const loc0 = String(job.location || 'Remote').split(',')[0].trim() || 'Remote';
    const locKey = R.slugify(loc0);
    if (!locLabels.has(locKey)) locLabels.set(locKey, loc0);
    push(byLoc, locKey, job);
    const compKey = R.slugify(job.company);
    if (!compLabels.has(compKey)) compLabels.set(compKey, job.company);
    push(byComp, compKey, job);
    push(bySource, job.source, job);
  }

  const catList = [...byCat.entries()]
    .map(([key, list]) => ({ key, count: list.length }))
    .sort((a, b) => b.count - a.count);
  const locList = [...byLoc.entries()]
    .filter(([, list]) => list.length >= LOKASI_MIN)
    .map(([key, list]) => ({ key, label: locLabels.get(key), count: list.length }))
    .sort((a, b) => b.count - a.count);
  const compList = [...byComp.entries()]
    .filter(([, list]) => list.length >= PERUSAHAAN_MIN)
    .map(([key, list]) => ({ key, label: compLabels.get(key), count: list.length }))
    .sort((a, b) => b.count - a.count);
  const sourceList = ATTRIBUTION.map((a) => {
    const key = a.name.toLowerCase();
    return { key, label: a.name, url: a.url, count: bySource.get(key)?.length || 0 };
  });
  const remoteCount = jobs.filter((j) => /remote/i.test(`${j.work_mode || ''} ${j.location || ''}`)).length;

  R.setCtx({ slugs, cats: catList, sources: sourceList, locs: locList, total: jobs.length, generatedAt });

  const trending = trendingTags(jobs, TRENDING_DAYS);
  const sidebar = () => `<aside>
  ${
    trending.length
      ? `<div class="widget"><h2>Trending Sepekan</h2><div class="chips">${trending
          .map((t) => `<a class="chip" href="/cari/?q=${encodeURIComponent(t.tag)}">${R.esc(t.tag)} <span class="count">${t.count}</span></a>`)
          .join('')}</div></div>`
      : ''
  }
  <div class="widget"><h2>Kategori</h2><ul>${catList
    .map((c) => `<li><a href="/kategori/${c.key}/">${R.esc(R.categoryLabel(c.key))}<span class="count">${R.fmtNum(c.count)}</span></a></li>`)
    .join('')}</ul></div>
  <div class="widget"><h2>Sumber Data</h2><ul>${sourceList
    .map((s) => `<li><a href="/sumber/${s.key}/">${R.esc(s.label)}<span class="count">${R.fmtNum(s.count)}</span></a></li>`)
    .join('')}</ul></div>
  <div class="widget"><h2>Statistik</h2><ul>
    <li><a href="/">Total lowongan<span class="count">${R.fmtNum(jobs.length)}</span></a></li>
    <li><a href="/lokasi/remote/">Lowongan remote<span class="count">${R.fmtNum(remoteCount)}</span></a></li>
    <li><a href="/lokasi/">Lokasi tersedia<span class="count">${R.fmtNum(locList.length)}</span></a></li>
    <li><a href="/perusahaan/">Perusahaan<span class="count">${R.fmtNum(compList.length)}</span></a></li>
  </ul></div>
</aside>`;

  // ── 3. Akumulator sitemap ──
  const sitemap = [];
  const addSm = (p, lastmod) => sitemap.push({ loc: R.url(p), lastmod });

  // ── 4. Beranda + paginasi ──
  const totalHome = Math.ceil(jobs.length / PER_PAGE);
  const heroForm = `<form class="searchform" action="/cari/" method="get" role="search">
      <input type="search" name="q" placeholder="Cari posisi, perusahaan, atau lokasi…" aria-label="Cari lowongan">
      <button type="submit">Cari</button>
    </form>`;
  for (let pg = 1; pg <= totalHome; pg++) {
    const slice = jobs.slice((pg - 1) * PER_PAGE, pg * PER_PAGE);
    const p = pg === 1 ? '/' : `/page/${pg}/`;
    const featured = pg === 1 ? jobs.filter((j) => j.company_info?.logo).slice(0, 12) : [];
    const main = `<section class="hero">
  <div class="wrap">
    <h1>Lowongan Kerja Terbaru${pg > 1 ? ` — Halaman ${pg}` : ''}</h1>
    <p>${R.fmtNum(jobs.length)} lowongan dari 9 sumber tepercaya — dengan deskripsi lengkap, diperbarui otomatis tiap 2 jam.</p>
    ${heroForm}
    <div class="hero-stats">
      <span><strong>${R.fmtNum(jobs.length)}</strong> Lowongan aktif</span>
      <span><strong>${R.fmtNum(catList.length)}</strong> Kategori</span>
      <span><strong>${R.fmtNum(sourceList.length)}</strong> Sumber data</span>
      <span><strong>${R.fmtDate(generatedAt)}</strong> Diperbarui</span>
    </div>
  </div>
</section>
<div class="wrap page-wrap"><div class="cols">
  <div>
    ${
      featured.length
        ? `<h2 class="section-title">✨ Lamar Sekarang</h2><div class="featured">${featured.map(R.jobCardFeatured).join('')}</div>`
        : ''
    }
    <h2 class="section-title">Lowongan Terbaru</h2>
    ${slice.map(R.jobCard).join('\n')}
    ${R.pagination('/', pg, totalHome)}
  </div>
  ${sidebar()}
</div></div>`;
    const title = pg === 1 ? `${SITE_NAME} — ${TAGLINE}` : `Lowongan Kerja Terbaru — Halaman ${pg} | ${SITE_NAME}`;
    const description =
      pg === 1
        ? `${R.fmtNum(jobs.length)} lowongan kerja terbaru dari 9 sumber tepercaya. Deskripsi lengkap, benefit, info perusahaan — update otomatis tiap 2 jam.`
        : `Halaman ${pg} dari ${totalHome} — daftar lowongan kerja terbaru ${SITE_NAME}.`;
    await write(
      pg === 1 ? 'index.html' : `page/${pg}/index.html`,
      R.page({
        title,
        description,
        path: p,
        active: 'home',
        prev: pg > 1 ? (pg === 2 ? '/' : `/page/${pg - 1}/`) : undefined,
        next: pg < totalHome ? `/page/${pg + 1}/` : undefined,
        jsonLd: pg === 1 ? [R.ldWebSite()] : [],
        main,
      })
    );
    addSm(p, genDate(generatedAt));
  }

  // ── 5. Detail loker ──
  const fact = (k, v) => (v ? `<div class="fact"><span class="k">${k}</span><span class="v">${v}</span></div>` : '');
  for (const job of jobs) {
    const slug = slugs.get(job.id);
    const p = `/loker/${slug}/`;
    const sal = R.salaryText(job.salary);
    const isNew = job.posted_at && Date.now() - Date.parse(job.posted_at) < 86_400_000;
    const desc = job.description || job.excerpt || `${job.title} di ${job.company}. Silakan lamar langsung di ${R.sourceLabel(job.source)}.`;
    const metaDesc = String(job.excerpt || desc).slice(0, 158).trim();
    const related = (byCat.get(job.category) || []).filter((x) => x.id !== job.id).slice(0, 5);
    const ci = job.company_info || {};
    const crumbs = [
      { name: 'Beranda', path: '/' },
      { name: R.categoryLabel(job.category), path: `/kategori/${job.category}/` },
      { name: job.title },
    ];
    const main = `<div class="wrap page-wrap">${R.breadcrumbs(crumbs)}
<article class="detail">
  <div class="detail-head">
    ${R.logoHtml(job)}
    <div>
      <h1>${R.esc(job.title)}${isNew ? '<span class="badge-baru">Baru</span>' : ''}</h1>
      <p class="jmeta"><strong>${R.esc(job.company)}</strong> &bull; ${R.esc(job.location)}${
        job.job_type ? ' &bull; ' + R.esc(job.job_type) : ''
      } &bull; Diposting <time datetime="${R.esc(job.posted_at || '')}">${R.fmtDate(job.posted_at)}</time></p>
    </div>
  </div>
  <div class="apply-row">
    <a class="btn-apply" href="${R.esc(job.url)}" target="_blank" rel="nofollow sponsored noopener">Lamar Sekarang di ${R.esc(
      R.sourceLabel(job.source)
    )}</a>
    <span class="small muted">Dipublikasikan oleh ${R.esc(R.sourceLabel(job.source))} — lamaran diproses langsung di situs sumber.</span>
  </div>
  <div class="facts">
    ${fact('Kategori', `<a class="chip" href="/kategori/${job.category}/">${R.esc(R.categoryLabel(job.category))}</a>`)}
    ${fact('Lokasi', R.esc(job.location))}
    ${fact('Tipe Kerja', R.esc(job.job_type || ''))}
    ${fact('Gaji', R.esc(sal || ''))}
    ${fact('Pendidikan', R.esc(job.education || ''))}
    ${fact('Pengalaman', R.esc(job.experience || ''))}
    ${fact('Work Mode', R.esc(job.work_mode || ''))}
    ${fact('Sumber', `<a href="/sumber/${job.source}/">${R.esc(R.sourceLabel(job.source))}</a>`)}
  </div>
  <section class="desc">
    <h2>Deskripsi Lowongan</h2>
    ${R.paragraphs(desc)}
  </section>
  ${
    job.benefits?.length
      ? `<section class="benefits"><h2>Benefit &amp; Fasilitas</h2><ul>${job.benefits.map((b) => `<li>${R.esc(b)}</li>`).join('')}</ul></section>`
      : ''
  }
  ${
    Object.keys(ci).length
      ? `<section class="company-box">
    ${R.logoHtml(job)}
    <div>
      <h2>Tentang ${R.esc(job.company)}</h2>
      ${ci.industry ? `<p><strong>Industri:</strong> ${R.esc(ci.industry)}</p>` : ''}
      ${ci.description ? `<p>${R.esc(ci.description)}</p>` : ''}
      <p class="small">
        ${ci.website ? `<a href="${R.esc(ci.website)}" target="_blank" rel="noopener nofollow">🌐 Situs web</a> &nbsp;` : ''}
        ${ci.email ? `<a href="mailto:${R.esc(ci.email)}">✉️ ${R.esc(ci.email)}</a> &nbsp;` : ''}
        ${ci.phone ? `📞 ${R.esc(ci.phone)}` : ''}
      </p>
    </div>
  </section>`
      : ''
  }
  <p class="disclaimer">⚠️ Lowongan ini dikumpulkan otomatis dari ${R.esc(R.sourceLabel(job.source))}. Selalu periksa keaslian lowongan dan lamar lewat tautan resmi di atas.</p>
</article>
${
  related.length
    ? `<section class="related"><h2 class="section-title">Lowongan Serupa</h2>${related.map(R.jobCard).join('')}</section>`
    : ''
}</div>`;
    await write(
      `loker/${slug}/index.html`,
      R.page({
        title: `${job.title} — ${job.company} | Lowongan Kerja ${SITE_NAME}`,
        description: metaDesc,
        path: p,
        active: 'home',
        ogType: 'article',
        ogImage: ci.logo || undefined,
        jsonLd: [R.ldJobPosting(job, p), R.ldBreadcrumb(crumbs)],
        main,
      })
    );
    addSm(p, genDate(job.posted_at) || genDate(generatedAt));
  }

  // ── 6. Halaman daftar (kategori / lokasi / perusahaan / sumber) ──
  const writeListPages = async ({ prefix, items, byMap, h1, titleOf, descOf, active, crumbsOf }) => {
    for (const it of items) {
      const list = byMap.get(it.key) || [];
      if (!list.length) continue;
      const tp = Math.ceil(list.length / PER_PAGE);
      const crumbs = crumbsOf(it);
      for (let pg = 1; pg <= tp; pg++) {
        const slice = list.slice((pg - 1) * PER_PAGE, pg * PER_PAGE);
        const p = pg === 1 ? `${prefix}${it.key}/` : `${prefix}${it.key}/page/${pg}/`;
        const main = `<div class="wrap page-wrap"><div class="cols"><div>
${R.breadcrumbs(crumbs)}
<div class="page-head">
  <h1>${R.esc(h1(it))}${pg > 1 ? ` — Halaman ${pg}` : ''}</h1>
  <p class="page-desc">${R.fmtNum(list.length)} lowongan tersedia · Diperbarui ${R.fmtDate(generatedAt)}</p>
</div>
${slice.map(R.jobCard).join('\n')}
${R.pagination(`${prefix}${it.key}/`, pg, tp)}
</div>${sidebar()}</div></div>`;
        // Tata letak daftar: utama penuh + sidebar di bawah (sudah nyaman di mobile).
        await write(
          `${prefix.slice(1)}${it.key}/${pg > 1 ? `page/${pg}/` : ''}index.html`,
          R.page({
            title: pg === 1 ? titleOf(it, 0) : titleOf(it, pg),
            description: descOf(it),
            path: p,
            active,
            prev: pg > 1 ? (pg === 2 ? `${prefix}${it.key}/` : `${prefix}${it.key}/page/${pg - 1}/`) : undefined,
            next: pg < tp ? `${prefix}${it.key}/page/${pg + 1}/` : undefined,
            jsonLd: [R.ldBreadcrumb(crumbs)],
            main,
          })
        );
        addSm(p, genDate(generatedAt));
      }
    }
  };

  await writeListPages({
    prefix: '/kategori/',
    items: catList,
    byMap: byCat,
    h1: (it) => `Lowongan Kerja ${R.categoryLabel(it.key)}`,
    titleOf: (it, pg) =>
      `${pg ? `Lowongan Kerja ${R.categoryLabel(it.key)} — Halaman ${pg}` : `Lowongan Kerja ${R.categoryLabel(it.key)} (${R.fmtNum(it.count)})`} | ${SITE_NAME}`,
    descOf: (it) => `Daftar ${R.fmtNum(it.count)} lowongan kerja ${R.categoryLabel(it.key)} terbaru, lengkap dengan deskripsi dan info perusahaan.`,
    active: 'kategori',
    crumbsOf: (it) => [
      { name: 'Beranda', path: '/' },
      { name: 'Kategori', path: '/kategori/' },
      { name: R.categoryLabel(it.key) },
    ],
  });
  await writeListPages({
    prefix: '/lokasi/',
    items: locList,
    byMap: byLoc,
    h1: (it) => `Lowongan Kerja ${it.label}`,
    titleOf: (it, pg) =>
      `${pg ? `Lowongan Kerja ${it.label} — Halaman ${pg}` : `Lowongan Kerja ${it.label} (${R.fmtNum(it.count)})`} | ${SITE_NAME}`,
    descOf: (it) => `Daftar ${R.fmtNum(it.count)} lowongan kerja di ${it.label} terbaru — dari 9 sumber tepercaya.`,
    active: 'lokasi',
    crumbsOf: (it) => [
      { name: 'Beranda', path: '/' },
      { name: 'Lokasi', path: '/lokasi/' },
      { name: it.label },
    ],
  });
  await writeListPages({
    prefix: '/perusahaan/',
    items: compList,
    byMap: byComp,
    h1: (it) => `Lowongan Kerja di ${it.label}`,
    titleOf: (it, pg) =>
      `${pg ? `Lowongan Kerja di ${it.label} — Halaman ${pg}` : `Lowongan Kerja di ${it.label} (${R.fmtNum(it.count)})`} | ${SITE_NAME}`,
    descOf: (it) => `Info lengkap lowongan kerja di ${it.label} — ${R.fmtNum(it.count)} posisi aktif, diperbarui otomatis.`,
    active: 'perusahaan',
    crumbsOf: (it) => [
      { name: 'Beranda', path: '/' },
      { name: 'Perusahaan', path: '/perusahaan/' },
      { name: it.label },
    ],
  });
  await writeListPages({
    prefix: '/sumber/',
    items: sourceList,
    byMap: bySource,
    h1: (it) => `Lowongan dari ${it.label}`,
    titleOf: (it, pg) =>
      `${pg ? `Lowongan dari ${it.label} — Halaman ${pg}` : `Lowongan dari ${it.label} (${R.fmtNum(it.count)})`} | ${SITE_NAME}`,
    descOf: (it) => `Kumpulan lowongan ${SITE_NAME} yang berasal dari ${it.label}.`,
    active: '',
    crumbsOf: (it) => [
      { name: 'Beranda', path: '/' },
      { name: 'Sumber', path: '/sumber/' },
      { name: it.label },
    ],
  });

  // ── 7. Halaman overview (indeks) ──
  const gridCards = (arr, hrefOf, labelOf) =>
    `<div class="grid-cards">${arr
      .map((x) => `<a href="${hrefOf(x)}">${R.esc(labelOf(x))}<span class="count">${R.fmtNum(x.count)} lowongan</span></a>`)
      .join('')}</div>`;

  await write(
    'kategori/index.html',
    R.page({
      title: `Semua Kategori Lowongan | ${SITE_NAME}`,
      description: `Jelajahi ${catList.length} kategori lowongan kerja — dari IT & Teknologi sampai Kesehatan. Pilih kategori dan lamar.`,
      path: '/kategori/',
      active: 'kategori',
      jsonLd: [R.ldBreadcrumb([{ name: 'Beranda', path: '/' }, { name: 'Kategori' }])],
      main: `<div class="wrap page-wrap">${R.breadcrumbs([{ name: 'Beranda', path: '/' }, { name: 'Kategori' }])}
<div class="page-box">
  <h1>Semua Kategori Lowongan</h1>
  <p class="page-desc">${catList.length} kategori, ${R.fmtNum(jobs.length)} lowongan aktif.</p>
  ${gridCards(catList, (c) => `/kategori/${c.key}/`, (c) => R.categoryLabel(c.key))}
</div></div>`,
    })
  );
  addSm('/kategori/', genDate(generatedAt));

  await write(
    'lokasi/index.html',
    R.page({
      title: `Lowongan Kerja per Lokasi | ${SITE_NAME}`,
      description: `Cari lowongan kerja berdasarkan lokasi — ${locList.length} lokasi di dalam dan luar negeri.`,
      path: '/lokasi/',
      active: 'lokasi',
      jsonLd: [R.ldBreadcrumb([{ name: 'Beranda', path: '/' }, { name: 'Lokasi' }])],
      main: `<div class="wrap page-wrap">${R.breadcrumbs([{ name: 'Beranda', path: '/' }, { name: 'Lokasi' }])}
<div class="page-box">
  <h1>Lowongan Kerja per Lokasi</h1>
  <p class="page-desc">${locList.length} lokasi dengan lowongan aktif.</p>
  ${gridCards(locList, (l) => `/lokasi/${l.key}/`, (l) => l.label)}
</div></div>`,
    })
  );
  addSm('/lokasi/', genDate(generatedAt));

  await write(
    'perusahaan/index.html',
    R.page({
      title: `Perusahaan yang Membuka Lowongan | ${SITE_NAME}`,
      description: `Daftar ${compList.length} perusahaan yang sedang membuka lowongan melalui ${SITE_NAME}.`,
      path: '/perusahaan/',
      active: 'perusahaan',
      jsonLd: [R.ldBreadcrumb([{ name: 'Beranda', path: '/' }, { name: 'Perusahaan' }])],
      main: `<div class="wrap page-wrap">${R.breadcrumbs([{ name: 'Beranda', path: '/' }, { name: 'Perusahaan' }])}
<div class="page-box">
  <h1>Perusahaan yang Membuka Lowongan</h1>
  <p class="page-desc">${compList.length} perusahaan aktif merekrut.</p>
  ${gridCards(compList.slice(0, 300), (c) => `/perusahaan/${c.key}/`, (c) => c.label)}
</div></div>`,
    })
  );
  addSm('/perusahaan/', genDate(generatedAt));

  await write(
    'sumber/index.html',
    R.page({
      title: `Sumber Data Lowongan | ${SITE_NAME}`,
      description: `Transparansi data: ${SITE_NAME} mengindeks lowongan dari 9 sumber tepercaya. Lihat daftarnya di sini.`,
      path: '/sumber/',
      active: '',
      jsonLd: [R.ldBreadcrumb([{ name: 'Beranda', path: '/' }, { name: 'Sumber' }])],
      main: `<div class="wrap page-wrap">${R.breadcrumbs([{ name: 'Beranda', path: '/' }, { name: 'Sumber' }])}
<div class="page-box">
  <h1>Sumber Data Lowongan</h1>
  <p class="page-desc">Semua lowongan di situs ini dikumpulkan otomatis dari sumber-sumber berikut. Klik untuk melihat lowongannya, atau kunjungi situs resmi untuk melamar.</p>
  ${gridCards(sourceList, (s) => `/sumber/${s.key}/`, (s) => s.label)}
</div></div>`,
    })
  );
  addSm('/sumber/', genDate(generatedAt));

  // ── 8. Cari (noindex) + Tentang ──
  await write(
    'cari/index.html',
    R.page({
      title: `Cari Lowongan Kerja | ${SITE_NAME}`,
      description: `Cari ${R.fmtNum(jobs.length)} lowongan kerja berdasarkan posisi, perusahaan, atau lokasi.`,
      path: '/cari/',
      noindex: true,
      active: '',
      main: `<div class="wrap page-wrap">
<div class="page-box">
  <h1>Cari Lowongan Kerja</h1>
  <input type="search" id="q" placeholder="Ketik posisi, perusahaan, atau lokasi… (contoh: developer jakarta)" autocomplete="off" autofocus>
  <p id="jumlah">Memuat indeks…</p>
  <div id="hasil"></div>
</div>
</div>
<script src="/assets/app.js" defer></script>`,
    })
  );

  await write(
    'tentang/index.html',
    R.page({
      title: `Tentang ${SITE_NAME} | ${SITE_NAME}`,
      description: `Tentang ${SITE_NAME}: situs agregator lowongan kerja otomatis dari 9 sumber tepercaya. Kenali cara kerja & sumber datanya.`,
      path: '/tentang/',
      active: 'tentang',
      jsonLd: [R.ldOrganization(), R.ldBreadcrumb([{ name: 'Beranda', path: '/' }, { name: 'Tentang' }])],
      main: `<div class="wrap page-wrap">${R.breadcrumbs([{ name: 'Beranda', path: '/' }, { name: 'Tentang' }])}
<div class="page-box">
  <h1>Tentang ${SITE_NAME}</h1>
  <p>${SITE_NAME} adalah agregator lowongan kerja yang mengumpulkan lowongan terbaru dari 9 sumber tepercaya — 4 API resmi global dan 5 sumber Indonesia — lalu menampilkannya secara lengkap: deskripsi, benefit, info perusahaan, hingga kontak. Diperbarui otomatis tiap 2 jam.</p>
  <h2>Cara kerja</h2>
  <p>Setiap 2 jam sistem menarik lowongan segar (maksimal 30 hari) dari seluruh sumber, mendeduplikasi, lalu merender halaman statis baru. Kalau sebuah sumber sedang down, sumber lain tetap jalan — data tidak pernah kosong.</p>
  <h2>Sumber data</h2>
  <ul>
    ${sourceList.map((s) => `<li><a href="${R.esc(s.url)}" target="_blank" rel="noopener">${R.esc(s.label)}</a> — ${R.fmtNum(s.count)} lowongan aktif</li>`).join('')}
  </ul>
  <h2>Disclaimer</h2>
  <p>${SITE_NAME} bukan perekrut. Kami hanya mengindeks dan menampilkan informasi yang tersedia publik dari sumber di atas — <strong>setiap lamaran diproses langsung di situs sumber asli</strong>. Selalu verifikasi keaslian lowongan sebelum memberikan data pribadi. Ada lowongan bermasalah? Laporkan lewat <a href="https://github.com/saragihsalan/loker-api/issues" target="_blank" rel="noopener">issue repo kami</a>.</p>
</div></div>`,
    })
  );
  addSm('/tentang/', genDate(generatedAt));

  // ── 9. Aset + salinan API ──
  await cp(path.join(STATIC_DIR, 'assets'), path.join(SITE_DIR, 'assets'), { recursive: true });
  await writeFile(path.join(SITE_DIR, 'assets', 'og-default.png'), makeOgPNG());
  await writeFile(
    path.join(SITE_DIR, 'assets', 'search-index.json'),
    JSON.stringify(
      jobs.map((j) => ({
        t: j.title,
        c: j.company,
        l: j.location,
        k: R.categoryLabel(j.category),
        u: `/loker/${slugs.get(j.id)}/`,
      }))
    )
  );
  await cp(API_DIR, path.join(SITE_DIR, 'api'), { recursive: true });

  // ── 10. sitemap / robots / feed / 404 / .htaccess ──
  await write(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
      .map((e) => `<url><loc>${R.esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>\n`
  );
  await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${R.url('/sitemap.xml')}\n`);

  const feedJobs = jobs.filter((j) => j.posted_at).slice(0, 20);
  await write(
    'feed.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${R.esc(SITE_NAME)} — Lowongan Kerja Terbaru</title>
<link>${R.url('/')}</link>
<description>${R.esc(TAGLINE)} — update otomatis tiap 2 jam.</description>
<language>id-id</language>
<atom:link href="${R.url('/feed.xml')}" rel="self" type="application/rss+xml"/>
${feedJobs
  .map((j) => {
    const u = R.url(`/loker/${slugs.get(j.id)}/`);
    const desc = String(j.excerpt || j.description || '').replace(/]]>/g, ']]]]><![CDATA[>');
    return `<item>
<title>${R.esc(j.title)} — ${R.esc(j.company)}</title>
<link>${u}</link>
<guid isPermaLink="true">${u}</guid>
<pubDate>${new Date(j.posted_at).toUTCString()}</pubDate>
<description><![CDATA[${desc}]]></description>
</item>`;
  })
  .join('\n')}
</channel></rss>\n`
  );

  await write(
    '404.html',
    R.page({
      title: `Halaman Tidak Ditemukan (404) | ${SITE_NAME}`,
      description: 'Halaman yang kamu cari tidak ada.',
      path: '/404.html',
      noindex: true,
      active: '',
      main: `<div class="wrap page-wrap"><div class="page-box center">
  <h1>404 — Halaman Tidak Ada</h1>
  <p>Lowongan yang dicari mungkin sudah kedaluwarsa atau tautannya salah ketik.</p>
  <p><a class="btn-apply" href="/">Kembali ke Beranda</a></p>
  <p class="small muted">Coba juga: ${catList
    .slice(0, 5)
    .map((c) => `<a href="/kategori/${c.key}/">${R.esc(R.categoryLabel(c.key))}</a>`)
    .join(' · ')}</p>
</div></div>`,
    })
  );

  await write(
    '.htaccess',
    `# ${SITE_NAME} — konfigurasi hosting (LiteSpeed/shared hosting)
DirectoryIndex index.html
ErrorDocument 404 /404.html

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType application/json "access plus 1 hour"
  ExpiresByType text/html "access plus 0 seconds"
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json application/xml image/svg+xml
</IfModule>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
</IfModule>
`
  );

  const pages = sitemap.length;
  console.log(
    `✓ Website: ${pages} halaman (detail ${jobs.length}, kategori ${catList.length}, lokasi ${locList.length}, perusahaan ${compList.length}) — ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
  return { pages, details: jobs.length };
}

// Jalankan langsung: node scripts/build-site.mjs (tanpa fetch ulang).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(await readFile(path.join(API_DIR, 'jobs.json'), 'utf8'));
  if (!Array.isArray(data.jobs) || !data.jobs.length) {
    console.error('FATAL: public/api/jobs.json kosong — jalankan npm run update dulu.');
    process.exit(1);
  }
  await buildSite(data.jobs, data.generated_at);
}
