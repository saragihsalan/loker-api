// Glints (Indonesia) — best-effort scraper, sama seperti Kalibrr. Tidak ada API
// publik; kita baca data embedded __NEXT_DATA__ di halaman job board.
// Catatan: ?page=/filter diabaikan server-side (selalu render 30 job ranking
// yang sama) — jadi kita ambil 1 halaman saja, 30 loker Indonesia terbaru.
// PENTING: firewall Glints memblokir undici/Node fetch (TLS fingerprint → "Glints
// - Firewall" 403) tapi mengizinkan curl. Kita panggil curl bawaan OS (ada di
// ubuntu runner & Windows 10+) — bukan dependency npm, tetap zero-install.
import { execFile } from 'node:child_process';
import { makeJob, toIso, isFresh, classifyCategory, PER_SOURCE_CAP } from '../lib.mjs';

const SOURCE = 'glints';
const BOARD_URL = 'https://glints.com/id/opportunities/jobs?countryCode=ID';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Fetch HTML via curl (lolos firewall Glints; -L ikuti redirect ke /jobs/explore). */
function fetchHtmlViaCurl(url) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      [
        '-sL', '-m', '40',
        '-A', CHROME_UA,
        '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H', 'Accept-Language: id-ID,id;q=0.9,en;q=0.8',
        url,
      ],
      // Buffer besar: halaman __NEXT_DATA__ Glints ~850KB.
      { maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(new Error(`curl gagal untuk ${url}: ${err.message}`));
        else resolve(stdout);
      }
    );
  });
}

/** Ekstrak JSON __NEXT_DATA__ (tag type=application/json). */
function parseBoardPage(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ tidak ditemukan (struktur Glints berubah?)');
  const jobs = JSON.parse(m[1])?.props?.pageProps?.initialJobs?.jobsInPage;
  if (!Array.isArray(jobs)) throw new Error('props.pageProps.initialJobs.jobsInPage tidak ditemukan');
  return jobs;
}

/** Slug kota dari hierarki location.parents (level 3 = kota, 2 = provinsi). */
function locationName(job) {
  const parents = job.location?.parents || [];
  const city = parents.find((p) => p.level === 3)?.formattedName;
  const province = parents.find((p) => p.level === 2)?.formattedName;
  if (city || province) return [city, province].filter(Boolean).join(', ');
  return job.location?.formattedName || 'Indonesia';
}

const TYPE_MAP = { FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Kontrak', INTERNSHIP: 'Magang' };

export async function fetchJobs() {
  const html = await fetchHtmlViaCurl(BOARD_URL);
  const jobs = parseBoardPage(html);

  return jobs
    .filter((j) => j && j.title && j.id)
    // Job lama masih aktif kalau baru di-update ≤30 hari (updatedAt segar).
    .filter((j) => j.status === 'OPEN')
    .filter((j) => isFresh(toIso(j.createdAt)) || isFresh(toIso(j.updatedAt)))
    .slice(0, PER_SOURCE_CAP)
    .map((j) => {
      const sal = (j.salaries || [])[0];
      return makeJob({
        title: j.title,
        company: j.company?.brandName || j.company?.name || 'Unknown',
        // Pola URL Glints: /id/opportunities/jobs/{slug}/{id} — slug boleh generik.
        url: `https://www.glints.com/id/opportunities/jobs/${j.id}`,
        source: SOURCE,
        location: locationName(j),
        country: 'ID',
        jobType: TYPE_MAP[j.type] || (j.type || null),
        tags: (j.skills || []).map((s) => s?.skill).filter(Boolean),
        category: classifyCategory(j.title, j.company?.industry?.name, (j.skills || []).map((s) => s?.skill).join(' ')),
        salary: sal
          ? { min: sal.minAmount || null, max: sal.maxAmount || null, currency: sal.CurrencyCode || 'IDR' }
          : null,
        postedAt: toIso(j.createdAt),
        excerpt: '',
      });
    });
}
