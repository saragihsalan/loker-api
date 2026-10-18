/* Pencarian client-side — hanya dimuat di halaman /cari/. */
(async () => {
  const input = document.getElementById('q');
  const out = document.getElementById('hasil');
  const info = document.getElementById('jumlah');
  if (!input || !out) return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let data = [];
  try {
    data = await (await fetch('/assets/search-index.json')).json();
  } catch {
    info.textContent = 'Gagal memuat indeks pencarian. Muat ulang halaman.';
    return;
  }

  let timer;
  const render = (q) => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const res = terms.length
      ? data.filter((j) => terms.every((t) => (j.t + ' ' + j.c + ' ' + j.l + ' ' + j.k).toLowerCase().includes(t)))
      : [];
    info.textContent = terms.length
      ? res.length + ' lowongan ditemukan untuk “' + q + '”'
      : 'Ketik kata kunci — ' + data.length + ' lowongan terindex.';
    out.innerHTML = terms.length
      ? res.slice(0, 100).map((j) =>
          '<article class="card compact"><div class="jbody"><h2 class="jtitle"><a href="' + j.u + '">' + esc(j.t) + '</a></h2>' +
          '<p class="jmeta"><strong>' + esc(j.c) + '</strong> &bull; ' + esc(j.l) + ' &bull; ' + esc(j.k) + '</p></div></article>'
        ).join('') || '<p class="empty">Tidak ada hasil. Coba kata kunci lain, misal "developer" atau "jakarta".</p>'
      : '';
  };

  const params = new URLSearchParams(location.search);
  if (params.get('q')) {
    input.value = params.get('q');
    render(input.value);
  } else {
    render('');
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      render(input.value.trim());
      const u = new URL(location.href);
      if (input.value.trim()) u.searchParams.set('q', input.value.trim());
      else u.searchParams.delete('q');
      history.replaceState(null, '', u);
    }, 200);
  });
})();
