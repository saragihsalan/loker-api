// Dealls (Indonesia) — best-effort scraper. Tidak ada API publik; baca data
// embedded __NEXT_DATA__ (react-query dehydratedState) di halaman /jobs.
// Paginasi ?page= diabaikan server-side (selalu 18 job teratas) — ambil 1 halaman.
import { fetchText, makeJob, toIso, isFresh, classifyCategory, PER_SOURCE_CAP } from '../lib.mjs';

const SOURCE = 'dealls';
const BOARD_URL = 'https://dealls.com/jobs';

/** Ekstrak docs[] dari dehydratedState (cari query explore-job). */
function parseBoardPage(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ tidak ditemukan (struktur Dealls berubah?)');
  const queries = JSON.parse(m[1])?.props?.pageProps?.dehydratedState?.queries || [];
  const q = queries.find((x) => Array.isArray(x.queryKey) && String(x.queryKey[0]).includes('explore-job'));
  const docs = q?.state?.data?.pages?.[0]?.docs;
  if (!Array.isArray(docs)) throw new Error('dehydratedState explore-job docs tidak ditemukan');
  return docs;
}

const TYPE_MAP = { fullTime: 'Full-time', partTime: 'Part-time', contract: 'Kontrak', internship: 'Magang' };
const WORK_MAP = { remote: 'Remote', hybrid: 'Hybrid', onSite: 'On-site' };

export async function fetchJobs() {
  const html = await fetchText(BOARD_URL, { headers: { Accept: 'text/html' } });
  const docs = parseBoardPage(html);

  return docs
    .filter((j) => j && j.role && j.slug && j.company?.slug)
    .filter((j) => j.status === 'active')
    .filter((j) => isFresh(toIso(j.publishedAt)))
    .slice(0, PER_SOURCE_CAP)
    .map((j) =>
      makeJob({
        title: j.role,
        company: j.company?.name || 'Unknown',
        // Pola URL Dealls: /loker/{slug}~{company-slug} (terverifikasi 200).
        url: `https://dealls.com/loker/${j.slug}~${j.company.slug}`,
        source: SOURCE,
        location: [j.city?.name, j.country?.name].filter(Boolean).join(', ') || 'Indonesia',
        country: 'ID',
        jobType: TYPE_MAP[j.employmentTypes?.[0]] || j.employmentTypes?.[0] || null,
        tags: (j.skills || []).map((s) => s?.name).filter(Boolean),
        category: classifyCategory(j.role, j.jobRoleCategorySlug, (j.skills || []).map((s) => s?.name).join(' ')),
        salary: j.salaryRange
          ? { min: j.salaryRange.start || null, max: j.salaryRange.end || null, currency: 'IDR' }
          : null,
        postedAt: toIso(j.publishedAt),
        excerpt: '',
      })
    );
}
