// Lokerbumn (Indonesia) — via WordPress REST API resmi (tanpa scraping).
// Setiap post membawa deskripsi LENGKAP (content.rendered) + judul + tanggal,
// plus kategori nyata dari WP (BUMN, MAGANG, S1/D3/SMA, Management Trainee, dst).
// Kontak perusahaan (email/telepon/link) diambil regex dari isi posting.
import { fetchJson, makeJob, stripHtml, toIso, isFresh, classifyCategory, PER_SOURCE_CAP, DESCRIPTION_MAX } from '../lib.mjs';

const SOURCE = 'lokerbumn';
const BASE = 'https://lokerbumn.com';
const POSTS = `${BASE}/wp-json/wp/v2/posts`;
const CATS = `${BASE}/wp-json/wp/v2/categories`;

/** Peta id→nama kategori WP (sekali fetch, dipakai untuk label + klasifikasi). */
async function fetchCategoryMap() {
  const cats = await fetchJson(`${CATS}?per_page=100&_fields=id,name,slug`);
  if (!Array.isArray(cats)) throw new Error('kategori WP tidak berbentuk array');
  return new Map(cats.map((c) => [c.id, c.name]));
}

/** Kontak perusahaan: email / telepon / situs yang tertanam di isi posting. */
function extractContacts(html) {
  const email = html.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)?.[0] || null;
  const phone = html.match(/(?:\+62|62|0)8[1-9][\d\s.-]{6,14}\d/)?.[0]?.replace(/\s+/g, ' ').trim() || null;
  return { email, phone };
}

export async function fetchJobs() {
  // WP membatasi per_page maksimal 100 (di atas itu → HTTP 400).
  const perPage = Math.min(100, PER_SOURCE_CAP);
  const [catMap, posts] = await Promise.all([
    fetchCategoryMap(),
    fetchJson(`${POSTS}?per_page=${perPage}&orderby=date&order=desc&_fields=date,slug,link,title,content,excerpt,categories`),
  ]);
  if (!Array.isArray(posts)) throw new Error('posts WP tidak berbentuk array');

  return posts
    .filter((p) => p && p.title?.rendered && p.link)
    .filter((p) => isFresh(toIso(p.date)))
    .slice(0, PER_SOURCE_CAP)
    .map((p) => {
      const html = p.content?.rendered || '';
      const catNames = (p.categories || []).map((id) => catMap.get(id)).filter(Boolean);
      const contact = extractContacts(html);
      const title = stripHtml(p.title.rendered, 200);
      return makeJob({
        title,
        company: catNames[0] || 'BUMN / Instansi',
        url: p.link,
        source: SOURCE,
        location: 'Indonesia',
        country: 'ID',
        jobType: /magang/i.test(catNames.join(' ')) ? 'Magang' : null,
        tags: catNames,
        category: classifyCategory(title, catNames.join(' '), stripHtml(html).slice(0, 200)),
        salary: null,
        postedAt: toIso(p.date),
        excerpt: stripHtml(p.excerpt?.rendered || html),
        description: stripHtml(html, DESCRIPTION_MAX) || null,
        companyInfo: {
          // Lokerbumn adalah agregator instansi — kontak ada di badan posting.
          email: contact.email,
          phone: contact.phone,
          website: BASE,
        },
      });
    });
}
