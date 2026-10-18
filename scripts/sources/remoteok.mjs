// RemoteOK — https://remoteok.com/api (elemen pertama = notice legal, bukan job).
import { fetchJson, makeJob, stripHtml, toIso, isFresh, classifyCategory, PER_SOURCE_CAP } from '../lib.mjs';

const SOURCE = 'remoteok';

export async function fetchJobs() {
  const data = await fetchJson('https://remoteok.com/api');
  if (!Array.isArray(data)) throw new Error('Respons RemoteOK bukan array');

  const now = Date.now();
  return data
    // Elemen legal/notice tidak punya field position/url.
    .filter((j) => j && j.position && j.url)
    // Buang yang sudah lewat masa berlaku (RemoteOK menyediakan field expired).
    .filter((j) => !j.expired || new Date(j.expired).getTime() > now)
    .filter((j) => isFresh(toIso(j.date || j.epoch)))
    .slice(0, PER_SOURCE_CAP)
    .map((j) =>
      makeJob({
        title: j.position,
        company: j.company || 'Unknown',
        url: j.url,
        source: SOURCE,
        location: j.location || 'Remote',
        country: 'GLOBAL',
        jobType: null,
        tags: j.tags,
        category: classifyCategory(j.position, stripHtml(j.description).slice(0, 200), (j.tags || []).join(' ')),
        salary:
          j.salary_min || j.salary_max
            ? { min: j.salary_min || null, max: j.salary_max || null, currency: 'USD' }
            : null,
        postedAt: toIso(j.date || j.epoch),
        excerpt: stripHtml(j.description),
      })
    );
}
