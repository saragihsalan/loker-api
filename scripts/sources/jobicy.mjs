// Jobicy — https://jobicy.com/api/v2/remote-jobs (wajib kredit + tombol apply
// tetap mengarah ke URL asli, sesuai notice API mereka).
import { fetchJson, makeJob, stripHtml, toIso, isFresh, classifyCategory, PER_SOURCE_CAP, DESCRIPTION_MAX } from '../lib.mjs';

const SOURCE = 'jobicy';

export async function fetchJobs() {
  const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs');
  if (!Array.isArray(data.jobs)) throw new Error('Respons Jobicy tidak berisi jobs[]');

  return data.jobs
    .filter((j) => j && j.url && j.jobTitle)
    .filter((j) => isFresh(toIso(j.pubDate)))
    .slice(0, PER_SOURCE_CAP)
    .map((j) =>
      makeJob({
        title: j.jobTitle,
        company: j.companyName || 'Unknown',
        url: j.url,
        source: SOURCE,
        location: j.jobGeo || 'Remote',
        country: 'GLOBAL',
        jobType: j.jobType || null,
        tags: j.jobIndustry,
        category: classifyCategory(j.jobTitle, (j.jobIndustry || []).join(' ')),
        salary:
          j.annualSalaryMin || j.annualSalaryMax
            ? { min: j.annualSalaryMin || null, max: j.annualSalaryMax || null, currency: j.salaryCurrency || null }
            : null,
        postedAt: toIso(j.pubDate),
        excerpt: j.jobExcerpt || stripHtml(j.jobDescription),
        description: stripHtml(j.jobDescription, DESCRIPTION_MAX) || null,
      })
    );
}
