// Remotive — https://remotive.com/api/remote-jobs (wajib link balik, tidak boleh
// disubmit ulang ke aggregator pihak ketiga — API publik ini memang untuk didistribusikan
// dengan atribusi, sesuai notice legal mereka).
import { fetchJson, makeJob, stripHtml, toIso, isFresh, classifyCategory, PER_SOURCE_CAP, DESCRIPTION_MAX } from '../lib.mjs';

const SOURCE = 'remotive';

// Kategori resmi Remotive → slug kategori kita.
const CATEGORY_MAP = {
  'Software Development': 'tech',
  'Data Science': 'data',
  'Design': 'design',
  'Marketing': 'marketing',
  'Sales': 'sales',
  'Customer Support': 'support',
  'Finance & Accounting': 'finance',
  'Human Resources': 'hr',
  'Legal': 'legal',
  'Operations': 'operations',
  'Teaching & Education': 'education',
  'Healthcare': 'health',
};

export async function fetchJobs() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs');
  if (!Array.isArray(data.jobs)) throw new Error('Respons Remotive tidak berisi jobs[]');

  return data.jobs
    .filter((j) => j && j.url && j.title)
    .filter((j) => isFresh(toIso(j.publication_date)))
    .slice(0, PER_SOURCE_CAP)
    .map((j) =>
      makeJob({
        title: j.title,
        company: j.company_name || 'Unknown',
        url: j.url,
        source: SOURCE,
        location: j.candidate_required_location || 'Remote',
        country: 'GLOBAL',
        jobType: j.job_type || null,
        tags: j.tags,
        // Pakai kategori resmi Remotive kalau ada, fallback classifier teks.
        category: CATEGORY_MAP[j.category] || classifyCategory(j.title, j.category),
        salary: null, // field salary Remotive berupa teks bebas → biarkan null
        postedAt: toIso(j.publication_date),
        excerpt: stripHtml(j.description),
        description: stripHtml(j.description, DESCRIPTION_MAX) || null,
      })
    );
}
