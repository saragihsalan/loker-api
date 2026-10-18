// Template HTML + helper SEO. Semua data eksternal WAJIB lewat esc() (anti-XSS).
import { SITE_URL, SITE_NAME, TAGLINE } from './site.config.mjs';

/* ── Helper dasar ───────────────────────────── */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '') || 'lowongan';

export const url = (p) => SITE_URL + (p === '/' ? '/' : p);

const fmtShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

export const fmtDate = (iso) => (iso ? fmtShort.format(new Date(iso)) : '');
export const fmtDateLong = (iso) => (iso ? fmtLong.format(new Date(iso)) : '');
export const fmtNum = (n) => Number(n).toLocaleString('id-ID');

export function timeAgo(iso) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return d <= 30 ? `${d} hari lalu` : fmtDate(iso);
}

const CATEGORY_LABELS = {
  tech: 'IT & Teknologi', design: 'Desain', marketing: 'Marketing', sales: 'Penjualan',
  support: 'Dukungan Pelanggan', finance: 'Keuangan', hr: 'SDM & Rekrutmen',
  content: 'Konten & Penulisan', data: 'Data & AI', operations: 'Operasional',
  education: 'Pendidikan', health: 'Kesehatan', legal: 'Hukum', other: 'Lainnya',
};
const SOURCE_NAMES = {
  remoteok: 'RemoteOK', remotive: 'Remotive', jobicy: 'Jobicy', arbeitnow: 'Arbeitnow',
  kalibrr: 'Kalibrr', glints: 'Glints', dealls: 'Dealls', kitalulus: 'KitaLulus', lokerbumn: 'Lokerbumn',
};
export const categoryLabel = (c) => CATEGORY_LABELS[c] || c;
export const sourceLabel = (s) => SOURCE_NAMES[s] || s;

export function salaryText(salary) {
  if (!salary) return null;
  const { min, max, currency } = salary;
  const f = (n) => (currency === 'IDR' ? `Rp${fmtNum(n)}` : `${fmtNum(n)} ${currency}`);
  if (min != null && max != null) return min === max ? f(min) : `${f(min)} – ${f(max)}`;
  if (min != null) return `mulai ${f(min)}`;
  if (max != null) return `maks ${f(max)}`;
  return null;
}

/* ── Konteks build (diisi build-site sekali) ── */
const CTX = { slugs: new Map(), cats: [], sources: [], locs: [], total: 0, generatedAt: '' };
export function setCtx(partial) {
  Object.assign(CTX, partial);
}

const BRAND_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="14" fill="#0b5fff"/><rect x="14" y="26" width="36" height="24" rx="4" fill="#fff"/><path d="M26 26v-5a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v5" fill="none" stroke="#fff" stroke-width="4"/><rect x="14" y="34" width="36" height="6" fill="#0b5fff"/></svg>';

/* ── JSON-LD ────────────────────────────────── */
export const ldScript = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

export function ldWebSite() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: url('/'),
    description: TAGLINE,
    inLanguage: 'id',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: url('/cari/?q={search_term_string}') },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function ldBreadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: url(it.path),
    })),
  };
}

export function ldOrganization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: url('/'),
    logo: url('/assets/og-default.png'),
    description: TAGLINE,
    sameAs: ['https://github.com/saragihsalan/loker-api'],
  };
}

const EMPLOYMENT = {
  'full-time': 'FULL_TIME', 'full time': 'FULL_TIME', 'part-time': 'PART_TIME', 'part time': 'PART_TIME',
  contract: 'CONTRACT', kontrak: 'CONTRACT', internship: 'INTERN', magang: 'INTERN',
  freelance: 'FREELANCE', temporary: 'TEMPORARY', permanent: 'PERMANENT', tetap: 'PERMANENT',
};

export function ldJobPosting(job, path) {
  const posted = job.posted_at ? job.posted_at.slice(0, 10) : undefined;
  const valid = job.posted_at
    ? new Date(Date.parse(job.posted_at) + 30 * 86_400_000).toISOString().slice(0, 10)
    : undefined;
  const remote = /remote/i.test(`${job.work_mode || ''} ${job.location || ''}`);
  const parts = String(job.location || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: `${job.description || job.excerpt || job.title}\n\nMelamar: ${job.url}`,
    datePosted: posted,
    validThrough: valid,
    employmentType: EMPLOYMENT[String(job.job_type || '').toLowerCase()] || (job.job_type ? 'OTHER' : undefined),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      ...(job.company_info?.website ? { sameAs: job.company_info.website } : {}),
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(parts[0] ? { addressLocality: parts[0] } : {}),
        ...(job.country && job.country !== 'GLOBAL' ? { addressCountry: job.country } : {}),
      },
    },
    ...(remote ? { jobLocationType: 'TELECOMMUTE' } : {}),
    ...(job.salary
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: job.salary.currency,
            value: {
              '@type': 'QuantitativeValue',
              ...(job.salary.min != null ? { minValue: job.salary.min } : {}),
              ...(job.salary.max != null ? { maxValue: job.salary.max } : {}),
              unitText: job.salary.currency === 'IDR' ? 'MONTH' : 'YEAR',
            },
          },
        }
      : {}),
    url: url(path),
    identifier: { '@type': 'PropertyValue', name: SITE_NAME, value: job.id },
  };
}

/* ── Layout ─────────────────────────────────── */
function head({ title, description, path, jsonLd = [], noindex = false, prev, next, ogImage, ogType = 'website' }) {
  const canonical = url(path);
  const img = ogImage || url('/assets/og-default.png');
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-snippet:-1,max-image-preview:large'}">
<link rel="canonical" href="${esc(canonical)}">
${prev ? `<link rel="prev" href="${esc(url(prev))}">` : ''}${next ? `<link rel="next" href="${esc(url(next))}">` : ''}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="id_ID">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(SITE_NAME)} — Lowongan Terbaru" href="/feed.xml">
<link rel="stylesheet" href="/assets/style.css">
${jsonLd.map(ldScript).join('\n')}
</head>`;
}

function header(active) {
  const nav = [
    ['home', '/', 'Beranda'],
    ['kategori', '/kategori/', 'Kategori'],
    ['lokasi', '/lokasi/', 'Lokasi'],
    ['perusahaan', '/perusahaan/', 'Perusahaan'],
    ['tentang', '/tentang/', 'Tentang'],
  ];
  return `<header class="site-head">
  <div class="wrap head-row">
    <a class="brand" href="/">${BRAND_SVG}<span>${esc(SITE_NAME)}</span></a>
    <form class="searchform head-search" action="/cari/" method="get" role="search">
      <input type="search" name="q" placeholder="Cari lowongan…" aria-label="Cari lowongan">
      <button type="submit">Cari</button>
    </form>
    <nav class="nav" aria-label="Menu utama">
      ${nav.map(([k, p, l]) => `<a href="${p}"${k === active ? ' aria-current="page"' : ''}>${l}</a>`).join('\n      ')}
    </nav>
  </div>
</header>`;
}

function footer() {
  const upd = CTX.generatedAt ? fmtDateLong(CTX.generatedAt) + ', ' + new Date(CTX.generatedAt).toISOString().slice(11, 16) + ' UTC' : '';
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="foot-brand">${BRAND_SVG}<span>${esc(SITE_NAME)}</span></div>
        <p>${esc(TAGLINE)}. ${fmtNum(CTX.total)} lowongan aktif dari 9 sumber tepercaya — diperbarui otomatis tiap 2 jam.</p>
        <p class="small">Data: ${upd}</p>
      </div>
      <div>
        <h2>Kategori</h2>
        <div class="foot-chips">${CTX.cats.map((c) => `<a href="/kategori/${c.key}/">${esc(categoryLabel(c.key))}</a>`).join('')}</div>
      </div>
      <div class="foot-sources">
        <h2>Sumber Data</h2>
        <ul>${CTX.sources
          .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a> <span class="small">(${fmtNum(s.count)})</span></li>`)
          .join('')}</ul>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© ${new Date().getFullYear()} ${esc(SITE_NAME)}. Lihat <a href="/tentang/">Tentang &amp; Disclaimer</a>.</span>
      <span><a href="/sitemap.xml">Sitemap</a> · <a href="/feed.xml">RSS</a> · <a href="https://github.com/saragihsalan/loker-api" target="_blank" rel="noopener">API open-source</a></span>
    </div>
  </div>
</footer>`;
}

export function page({ title, description, path, jsonLd = [], noindex, prev, next, ogImage, ogType, active, main }) {
  return (
    head({ title, description, path, jsonLd, noindex, prev, next, ogImage, ogType }) +
    `
<body>
<a class="skip" href="#konten">Langsung ke konten</a>
${header(active)}
<main id="konten">
${main}
</main>
${footer()}
</body>
</html>
`
  );
}

/* ── Komponen ───────────────────────────────── */
export function breadcrumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${items
    .map((it, i) =>
      (it.path ? `<a href="${it.path}">${esc(it.name)}</a>` : `<span aria-current="page">${esc(it.name)}</span>`) +
      (i < items.length - 1 ? '<span aria-hidden="true">›</span>' : '')
    )
    .join('')}</nav>`;
}

export function logoHtml(job, size = '') {
  const logo = job.company_info?.logo;
  const initial = esc((job.company || '?').trim().charAt(0).toUpperCase() || '?');
  return `<div class="jlogo${logo ? '' : ' nologo'}${size ? ' ' + size : ''}">${
    logo
      ? `<img src="${esc(logo)}" alt="Logo ${esc(job.company)}" width="56" height="56" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('nologo')">`
      : ''
  }<span class="initial" aria-hidden="true">${initial}</span></div>`;
}

export function jobCard(job) {
  const slug = CTX.slugs.get(job.id) || slugify(job.title);
  const isNew = job.posted_at && Date.now() - Date.parse(job.posted_at) < 86_400_000;
  const sal = salaryText(job.salary);
  return `<article class="card">
  ${logoHtml(job)}
  <div class="jbody">
    <h2 class="jtitle"><a href="/loker/${slug}/">${esc(job.title)}</a>${isNew ? '<span class="badge-baru">Baru</span>' : ''}</h2>
    <p class="jmeta"><strong>${esc(job.company)}</strong> &bull; ${esc(job.location)}${job.job_type ? ' &bull; ' + esc(job.job_type) : ''}</p>
    <p class="jexcerpt">${esc(job.excerpt || job.description || '')}</p>
    <p class="jtags"><a class="chip" href="/kategori/${job.category}/">${esc(categoryLabel(job.category))}</a>${
      sal ? `<span class="chip plain">${esc(sal)}</span>` : ''
    }<span class="chip plain">Sumber: ${esc(sourceLabel(job.source))}</span> <time class="chip plain" datetime="${esc(job.posted_at || '')}">${timeAgo(job.posted_at)}</time></p>
  </div>
</article>`;
}

export function jobCardFeatured(job) {
  const slug = CTX.slugs.get(job.id) || slugify(job.title);
  const logo = job.company_info?.logo;
  const initial = esc((job.company || '?').trim().charAt(0).toUpperCase() || '?');
  return `<div class="fcard">
  <div class="flogo">${logo ? `<img src="${esc(logo)}" alt="Logo ${esc(job.company)}" loading="lazy" decoding="async" onerror="this.remove()">` : `<span class="initial">${initial}</span>`}</div>
  <a class="ftitle" href="/loker/${slug}/">${esc(job.title)}</a>
  <span class="fcomp">${esc(job.company)}</span>
  <a class="btn-lamar" href="/loker/${slug}/">Lamar Sekarang</a>
</div>`;
}

export function pagination(prefix, page, totalPages) {
  if (totalPages <= 1) return '';
  const href = (n) => (n <= 1 ? prefix || '/' : `${prefix}page/${n}/`);
  const nums = [...new Set([1, totalPages, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  let html = '<nav class="pag" aria-label="Navigasi halaman">';
  if (page > 1) html += `<a href="${href(page - 1)}" rel="prev">‹</a>`;
  let last = 0;
  for (const n of nums) {
    if (n - last > 1) html += '<span class="gap" aria-hidden="true">…</span>';
    html += n === page ? `<span class="active" aria-current="page">${n}</span>` : `<a href="${href(n)}">${n}</a>`;
    last = n;
  }
  if (page < totalPages) html += `<a href="${href(page + 1)}" rel="next">›</a>`;
  return html + '</nav>';
}

/** Deskripsi plain text → paragraf HTML (kelompok ±3 kalimat). */
export function paragraphs(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const sentences = t.split(/(?<=[.!?])\s+/);
  const out = [];
  for (let i = 0; i < sentences.length; i += 3) out.push(sentences.slice(i, i + 3).join(' '));
  return out.map((p) => `<p>${esc(p)}</p>`).join('\n');
}
