// KitaLulus (Indonesia) — via GraphQL publik (persisted query) yang sama persis
// dipakai situsnya sendiri. Tidak perlu API key; cukup header x-apollo-operation-name.
//
// Alur: (1) GET halaman /lowongan → ekstrak daftar slug dari RSC payload, lalu
// (2) per-slug panggil VacancyBySlug → data LENGKAP (deskripsi penuh, deskripsi
// perusahaan, benefit, gaji, kota, link kontak perusahaan). Ini sumber lokal
// dengan data paling kaya — cocok buat nampilin info lengkap di web loker.
import { fetchJson, fetchText, makeJob, stripHtml, toIso, isFresh, classifyCategory, PER_SOURCE_CAP, DESCRIPTION_MAX } from '../lib.mjs';

const SOURCE = 'kitalulus';
const BOARD_URL = 'https://www.kitalulus.com/lowongan';
const GQL = 'https://gql.kitalulus.com/graphql';
// sha256 persisted query untuk operasi VacancyBySlug (diambil dari situs resmi).
const VACANCY_BY_SLUG_HASH = '899999f42f1e4fa80ce7aca87de022a707873ed5eca2c354125bcc6bfbc6a671';
const GQL_ORIGIN = 'https://www.kitalulus.com';

/** Ambil daftar slug lowongan dari RSC payload halaman /lowongan. */
async function fetchSlugs() {
  const html = await fetchText(BOARD_URL, { headers: { Accept: 'text/html' } });
  const slugs = [...new Set([...html.matchAll(/lowongan\/detail\/([a-z0-9-]{4,})/g)].map((m) => m[1]))];
  if (!slugs.length) throw new Error('slug lowongan tidak ditemukan (struktur RSC KitaLulus berubah?)');
  return slugs;
}

/** Satu query VacancyBySlug. Header x-apollo-operation-name lolos proteksi CSRF. */
function fetchDetail(slug) {
  const url =
    `${GQL}?operationName=VacancyBySlug` +
    `&variables=${encodeURIComponent(JSON.stringify({ slug }))}` +
    `&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: VACANCY_BY_SLUG_HASH } }))}`;
  return fetchJson(url, {
    headers: {
      Accept: 'application/json',
      Origin: GQL_ORIGIN,
      Referer: `${GQL_ORIGIN}/`,
      'x-apollo-operation-name': 'VacancyBySlug',
    },
  }).then((j) => j?.data?.vacancyBySlug);
}

// updatedAt/closeDate KitaLulus dalam mikrodetik (÷1000 → milidetik).
const isoFromUs = (us) => (us ? toIso(Math.floor(Number(us) / 1000)) : null);

// Deskripsi perusahaan KitaLulus kadang berupa marker internal GraphQL
// ("<<ccr:…,string,328B>>") alih-alih teks nyata → buang kalau ketemu.
const cleanCompanyDesc = (s) => {
  const t = stripHtml(String(s || ''), 400);
  return /^<<ccr:/.test(t) ? null : t || null;
};

export async function fetchJobs() {
  const slugs = (await fetchSlugs()).slice(0, PER_SOURCE_CAP);

  // Detail paralel — satupun gagal tidak menggugurkan yang lain.
  const settled = await Promise.allSettled(slugs.map((s) => fetchDetail(s)));
  const details = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  if (!details.length) throw new Error('semua detail VacancyBySlug gagal');

  return details
    .filter((v) => v && v.slug && v.positionName)
    .filter((v) => v.isClosed === false && v.isPublished !== false)
    .filter((v) => isFresh(isoFromUs(v.updatedAt)))
    .slice(0, PER_SOURCE_CAP)
    .map((v) => {
      const c = v.company || {};
      const html = v.formattedDescription || v.description || '';
      // Gaji 0 = tidak dipampang → null.
      const hasSalary = Number(v.salaryLowerBound) > 0 || Number(v.salaryUpperBound) > 0;
      // contactWebrowse sering tanpa skema (mis. "www.bermudastrategis.com").
      const site = c.contactWeblink;
      return makeJob({
        title: v.positionName,
        company: c.name || 'Unknown',
        url: `${GQL_ORIGIN}/lowongan/detail/${v.slug}`,
        source: SOURCE,
        location: [v.city?.name, v.province?.name].filter(Boolean).join(', ') || 'Indonesia',
        country: 'ID',
        jobType: v.typeStr || null,
        tags: v.skillTags || [],
        category: classifyCategory(v.positionName, v.jobRole?.displayName, (v.skillTags || []).join(' ')),
        salary: hasSalary
          ? { min: Number(v.salaryLowerBound) || null, max: Number(v.salaryUpperBound) || null, currency: 'IDR' }
          : null,
        postedAt: isoFromUs(v.updatedAt),
        excerpt: stripHtml(html),
        description: stripHtml(html, DESCRIPTION_MAX) || null,
        companyInfo: {
          logo: c.logoUrl || null,
          description: cleanCompanyDesc(c.description),
          website: site ? (/^https?:/.test(site) ? site : `https://${site}`) : null,
          industry: c.companyIndustry?.name || null,
        },
        benefits: (v.benefits || []).map((b) => b?.copy).filter(Boolean),
        education: v.educationLevelStr || null,
        experience: v.minExperienceStr || null,
        workMode: v.locationSiteStr || null,
      });
    });
}
