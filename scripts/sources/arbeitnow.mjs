// Arbeitnow — https://www.arbeitnow.com/api/job-board-api (paginasi ?page=N).
import { fetchJson, makeJob, stripHtml, toIso, isFresh, classifyCategory, PER_SOURCE_CAP } from '../lib.mjs';

const SOURCE = 'arbeitnow';
const PAGES = 2; // 300 job/halaman; 2 halaman sudah menembus kap 500

export async function fetchJobs() {
  const jobs = [];
  for (let page = 1; page <= PAGES; page++) {
    const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    if (!Array.isArray(data.data)) throw new Error(`Respons Arbeitnow halaman ${page} tidak berisi data[]`);
    jobs.push(...data.data);
  }

  return jobs
    .filter((j) => j && j.title && j.slug)
    // Field tanggal mereka: created_at (unix detik). Bukan published_at.
    .filter((j) => isFresh(toIso(j.created_at)))
    .slice(0, PER_SOURCE_CAP)
    .map((j) =>
      makeJob({
        title: j.title,
        company: j.company_name || 'Unknown',
        // URL kerja: slug relatif → absolut; fallback ke kanonik kalibrr-style slug.
        url: j.url?.startsWith('http') ? j.url : `https://www.arbeitnow.com${j.url || `/job/${j.slug}`}`,
        source: SOURCE,
        location: j.remote ? 'Remote' : j.location || 'On-site',
        country: 'GLOBAL',
        jobType: (j.job_types || [])[0] || null,
        tags: j.tags,
        category: classifyCategory(j.title, stripHtml(j.description).slice(0, 200)),
        salary: null,
        postedAt: toIso(j.created_at),
        excerpt: stripHtml(j.description),
      })
    );
}
