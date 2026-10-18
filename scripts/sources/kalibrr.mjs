// Kalibrr (Indonesia) — best-effort scraper. Tidak ada API publik, jadi kita baca
// data embedded __NEXT_DATA__ di halaman job board. Kalau struktur situs berubah,
// throw → orchestrator mencatat warning dan LANJUT tanpa sumber ini.
import { fetchText, makeJob, stripHtml, toIso, classifyCategory } from '../lib.mjs';

const SOURCE = 'kalibrr';
// Catatan: paginasi ?page=/offset= TIDAK bekerja untuk data __NEXT_DATA__
// (semua halaman selalu merender 15 job teratas yang sama). Kita ambil 1 halaman
// saja — 15 loker Indonesia terbaru. Kalau suatu saat Kalibrr membuka API
// publik, tinggal ganti fetch ini.
const PAGES = 1;

/** Ekstrak JSON __NEXT_DATA__ dari HTML halaman job board. */
function parseBoardPage(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ tidak ditemukan (struktur Kalibrr berubah?)');
  const data = JSON.parse(m[1]);
  const jobs = data?.props?.pageProps?.jobs;
  if (!Array.isArray(jobs)) throw new Error('props.pageProps.jobs tidak ditemukan');
  return jobs;
}

export async function fetchJobs() {
  const all = [];
  for (let page = 1; page <= PAGES; page++) {
    const html = await fetchText(`https://www.kalibrr.com/job-board/id/${page}`, {
      headers: { Accept: 'text/html' },
    });
    all.push(...parseBoardPage(html));
  }

  return all
    .filter((j) => j && j.name && j.slug)
    .map((j) => {
      const addr = j.googleLocation?.addressComponents || {};
      const city = addr.city || null;
      const region = addr.region || null;
      const location = [city, region].filter(Boolean).join(', ') || (j.isWorkFromHome ? 'Remote (WFH)' : 'Indonesia');
      const salary =
        j.maximumSalary || j.baseSalary
          ? { min: j.baseSalary || null, max: j.maximumSalary || null, currency: j.salaryCurrency || 'IDR' }
          : null;
      return makeJob({
        title: j.name,
        company: j.companyName || j.company?.name || 'Unknown',
        url: `https://www.kalibrr.com/${j.company?.code || 'id'}/${j.slug}/job`,
        source: SOURCE,
        location,
        country: 'ID',
        jobType: j.tenure || null,
        tags: [j.function].filter(Boolean),
        category: classifyCategory(j.name, j.function, stripHtml(j.description).slice(0, 200)),
        salary,
        postedAt: toIso(j.activationDate || j.createdAt),
        excerpt: stripHtml(j.description),
      });
    });
}
