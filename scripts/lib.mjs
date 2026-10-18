// Library bersama — tanpa dependency eksternal (kunci set & forget).
import { createHash } from 'node:crypto';

export const RETENTION_DAYS = 30;
export const PER_SOURCE_CAP = 500;
export const EXCERPT_MAX = 500;
// Deskripsi penuh lebih panjang dari excerpt — dipakai biar web loker bisa
// menampilkan isi lowongan lengkap tanpa harus redirect ke sumber asli.
export const DESCRIPTION_MAX = 2000;
export const USER_AGENT =
  'loker-api/1.0 (+https://github.com/; open job aggregator; contact: repo issues)';

/** Fetch dengan 1x retry + backoff. Timeout 30 detik. */
export async function fetchJson(url, options = {}) {
  const attempt = async () => {
    const res = await fetch(url, {
      ...options,
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
    return res.json();
  };
  try {
    return await attempt();
  } catch (err) {
    console.warn(`  ! ${err.message} — coba ulang…`);
    await new Promise((r) => setTimeout(r, 3000));
    return await attempt();
  }
}

export async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
  return res.text();
}

/** ID stabil dari URL apply — dipakai untuk dedup lintas sumber. */
export function idFromUrl(url) {
  return createHash('sha1').update(String(url).trim()).digest('hex').slice(0, 16);
}

/** Buang tag HTML, rapikan whitespace, potong ke `max` karakter (default EXCERPT_MAX). */
export function stripHtml(html, max = EXCERPT_MAX) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Decode &lt;/&gt; SEBELUM strip tag — sebagian sumber (mis. RemoteOK)
    // meng-escape HTML penuh, jadi tag-nya literal &lt;p&gt; bukan <p>.
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Normalisasi tanggal apa pun (unix detik/ms, ISO) → ISO string, atau null. */
export function toIso(value) {
  if (value == null || value === '') return null;
  let d;
  if (typeof value === 'number') {
    d = new Date(value < 1e12 ? value * 1000 : value);
  } else {
    d = new Date(value);
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isFresh(iso, days = RETENTION_DAYS) {
  if (!iso) return true; // tanpa tanggal = anggap segar (sort paling bawah)
  const age = Date.now() - new Date(iso).getTime();
  return age <= days * 86_400_000;
}

/**
 * Klasifikasi kategori. Judul diprioritaskan — tag/deskripsi sumber (mis. tag
 * RemoteOK yang berisik) hanya jadi fallback kalau judul tidak mengena.
 * Urutan rule penting: yang paling spesifik dicek duluan.
 */
const CATEGORY_RULES = [
  ['data', /\b(data (scientist|engineer|analyst|architect)|machine learning|nlp|business intelligence|bi analyst|etl)\b/i],
  ['design', /\b(design|designer|ux|ui|graphic|illustrator|visual|creative|brand designer|product designer)\b/i],
  ['marketing', /\b(marketing|seo|sem|growth|brand|social media|campaign|performance|content marketing|demand gen|advertis)\b/i],
  ['sales', /\b(sales|account executive|business development|revenue|partnership|account manager|bdr|sdr|closing)\b/i],
  ['support', /\b(support|customer success|helpdesk|service desk|customer service|technical assistance|cx)\b/i],
  ['finance', /\b(finance|accounting|accountant|payroll|tax|banking|audit|financial|treasury)\b/i],
  ['hr', /\b(hr|human resources|recruiter|recruiting|talent acquisition|people ops|people operations|staffing)\b/i],
  ['content', /\b(writer|content|copywriter|editor|journalist|translator|documentation|blog)\b/i],
  ['legal', /\b(legal|lawyer|counsel|compliance|paralegal|jurist)\b/i],
  ['operations', /\b(operations|ops|supply chain|logistics|procurement|warehouse|project manager|program manager)\b/i],
  ['education', /\b(teacher|teaching|tutor|instructor|education|curriculum|lecturer|trainer|pengajar)\b/i],
  ['health', /\b(health|nurse|medical|doctor|clinical|pharmacist|therapist|caregiver)\b/i],
  ['tech', /\b(developer|engineer|programmer|software|frontend|backend|fullstack|full stack|devops|sre|qa|mobile|android|ios|cloud|security|platform|infrastructure|webmaster|architect|dev)\b/i],
];

export function classifyCategory(title, ...rest) {
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(title || '')) return cat;
  }
  const s = rest.filter(Boolean).join(' ');
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(s)) return cat;
  }
  return 'other';
}

/**
 * Bangun record ternormalisasi. Field wajib: title, company, url, source.
 *
 * Field enriched (opsional, semua bisa null) — supaya web loker kelak bisa
 * menampilkan info lengkap tanpa hanya redirect ke sumber:
 *  - description   : isi lowongan penuh (plain text, ≤ DESCRIPTION_MAX)
 *  - company_info  : { logo, description, website, email, phone } (null bila kosong)
 *  - benefits      : string[] benefit/fasilitas
 *  - education, experience, work_mode : string ringkas bila tersedia
 */
export function makeJob({
  title,
  company,
  url,
  source,
  location,
  country,
  jobType,
  tags,
  category,
  salary,
  postedAt,
  excerpt,
  description = null,
  companyInfo = null,
  benefits = null,
  education = null,
  experience = null,
  workMode = null,
}) {
  // Rapikan company_info: buang nilai kosong; null bila tidak ada satu pun.
  let company_info = null;
  if (companyInfo) {
    const clean = Object.fromEntries(
      Object.entries(companyInfo).filter(([, v]) => v != null && v !== '')
    );
    if (Object.keys(clean).length) company_info = clean;
  }

  const cleanBenefits = (benefits || [])
    .map((b) => String(b).trim())
    .filter(Boolean);

  return {
    id: idFromUrl(url),
    title: String(title).trim(),
    company: String(company).trim(),
    location: (location || 'Remote').trim(),
    country: country || 'GLOBAL',
    job_type: jobType || null,
    category,
    tags: [...new Set((tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 10),
    salary: salary || null,
    posted_at: postedAt,
    source,
    url,
    description,
    company_info,
    benefits: cleanBenefits.length ? [...new Set(cleanBenefits)].slice(0, 15) : null,
    education: education || null,
    experience: experience || null,
    work_mode: workMode || null,
    excerpt,
  };
}

/** Dedup lintas sumber: buang yang URL-nya sama, lalu judul|perusahaan sama (case-insensitive). */
export function dedupe(jobs) {
  const byUrl = new Map();
  const byTitleCompany = new Map();
  const out = [];
  for (const j of jobs) {
    const keyUrl = j.url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    const keyTC = `${j.title}|${j.company}`.toLowerCase().replace(/\s+/g, ' ');
    if (byUrl.has(keyUrl) || byTitleCompany.has(keyTC)) continue;
    byUrl.set(keyUrl, true);
    byTitleCompany.set(keyTC, true);
    out.push(j);
  }
  return out;
}

/** Envelope standar tiap file API. */
export function envelope(generatedAt, jobs, filter = null) {
  const env = {
    generated_at: generatedAt,
    total: jobs.length,
    ...(filter ? { filter } : {}),
    _attribution: ATTRIBUTION,
    jobs,
  };
  return env;
}

export const ATTRIBUTION = [
  { name: 'RemoteOK', url: 'https://remoteok.com' },
  { name: 'Remotive', url: 'https://remotive.com' },
  { name: 'Jobicy', url: 'https://jobicy.com' },
  { name: 'Arbeitnow', url: 'https://arbeitnow.com' },
  { name: 'Kalibrr', url: 'https://www.kalibrr.com' },
  { name: 'Glints', url: 'https://glints.com' },
  { name: 'Dealls', url: 'https://dealls.com' },
  { name: 'KitaLulus', url: 'https://www.kitalulus.com' },
  { name: 'Lokerbumn', url: 'https://lokerbumn.com' },
];
