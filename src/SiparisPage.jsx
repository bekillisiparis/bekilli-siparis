// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal v4: SiparisPage
// 3 panel: Katalog Accordion (sol) + Sipariş Formu (orta) + Takip (sağ)
// ══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const API = '/api/siparis';

// ── XLSX CDN yükle (script tag — Vite production uyumlu) ──
function loadXLSX() {
  if (window._XLSX_FULL) return Promise.resolve(window._XLSX_FULL);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => { window._XLSX_FULL = window.XLSX; res(window.XLSX); };
    s.onerror = () => rej(new Error('SheetJS CDN yüklenemedi'));
    document.head.appendChild(s);
  });
}

// ── Excel şablon sütunları ──────────────────────────
const SABLON_SUTUNLAR = ['ÜRÜN KODU', 'ÜRÜN ADI (opsiyonel)', 'ADET', 'NOT'];
const SABLON_ORNEK = [
  ['3264700-AMBAC', 'Nozzle 3264700', 5, ''],
  ['5228275-STANADYNE', '', 2, 'Acil'],
];

async function apiCall(url, pin, body) {
  const opts = { headers: {} };
  if (pin) opts.headers['X-Siparis-PIN'] = pin;
  if (body) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.hata || `HTTP ${res.status}`); }
  return res.json();
}

// ── SiparisPage ─────────────────────────────────────
export default function SiparisPage({ t, pin, katalog, fiyatlar, siparisler, refreshSiparisler, showToast, sikAlinanlar }) {
  const [sepet, setSepet] = useState([]);
  const [busy, setBusy] = useState(false);
  // Filtreler
  const [katFilter, setKatFilter] = useState('');
  const [markaFilter, setMarkaFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [search, setSearch] = useState('');
  // Mobil sub-tab (sipariş formu vs takip)
  const [mobileView, setMobileView] = useState('form');

  // ── Sepet işlemleri ───────────────────────────────
  const sepeteEkle = useCallback((urunKod, urunAd, adet, not, yeniUrunData) => {
    const qty = parseInt(adet) || 1;
    setSepet(prev => {
      const existing = prev.find(s => s.urunKod === urunKod);
      if (existing) return prev.map(s => s.urunKod === urunKod ? { ...s, adet: s.adet + qty } : s);
      return [...prev, { id: Date.now(), urunKod, urunAd: urunAd || urunKod, adet: qty, not: not || '', yeniUrunData }];
    });
    showToast(`${urunKod} eklendi`);
    setMobileView('form');
  }, [showToast]);

  function sepettenSil(id) { setSepet(prev => prev.filter(s => s.id !== id)); }
  function sepetAdetGuncelle(id, yeniAdet) {
    const a = parseInt(yeniAdet);
    if (!a || a < 1) return;
    setSepet(prev => prev.map(s => s.id === id ? { ...s, adet: a } : s));
  }

  async function siparisGonder() {
    if (sepet.length === 0 || busy) return;
    setBusy(true);
    try {
      const kalemler = sepet.map(item => {
        const k = { urunKod: item.urunKod, urunAd: item.urunAd, adet: item.adet, not: item.not || '' };
        if (item.yeniUrunData) { k.yeniUrun = true; k.parcaNo = item.yeniUrunData.parcaNo; k.supplier = item.yeniUrunData.supplier; k.kategori = item.yeniUrunData.kategori; }
        return k;
      });
      await apiCall(API, pin, { islem: 'ekle', kalemler });
      await refreshSiparisler();
      setSepet([]);
      showToast(`${kalemler.length} ${t.satirlar} ${t.gonderildi}`);
      setMobileView('takip');
    } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }

  // ── Takip API işlemleri ──────────────────────────
  async function siparisSil(siparisId) {
    setBusy(true);
    try { await apiCall(API, pin, { islem: 'sil', siparisId }); await refreshSiparisler(); } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }
  async function kalemGuncelle(siparisId, kalemId, adet) {
    setBusy(true);
    try { await apiCall(API, pin, { islem: 'guncelle', siparisId, kalemId, adet: parseInt(adet) }); await refreshSiparisler(); } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }
  async function kalemSil(siparisId, kalemId) {
    setBusy(true);
    try { await apiCall(API, pin, { islem: 'kalem_sil', siparisId, kalemId }); await refreshSiparisler(); } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }

  // ── Derived: filtre + gruplama ─────────────────
  const kategoriler = useMemo(() => [...new Set(katalog.map(u => u.kategori).filter(Boolean))].sort(), [katalog]);
  const markalar = useMemo(() => [...new Set(katalog.map(u => u.marka).filter(Boolean))].sort(), [katalog]);
  const suppliers = useMemo(() => [...new Set(katalog.map(u => u.supplier).filter(Boolean))].sort(), [katalog]);

  const filtered = useMemo(() => {
    let list = katalog;
    if (search) { const s = search.toLowerCase(); list = list.filter(u => u.ad?.toLowerCase().includes(s) || u.kod?.toLowerCase().includes(s) || u.parcaNo?.toLowerCase().includes(s) || u.marka?.toLowerCase().includes(s)); }
    if (katFilter) list = list.filter(u => u.kategori === katFilter);
    if (markaFilter) list = list.filter(u => u.marka === markaFilter);
    if (supplierFilter) list = list.filter(u => u.supplier === supplierFilter);
    return list;
  }, [katalog, search, katFilter, markaFilter, supplierFilter]);

  // Accordion: Tür > Marka > Supplier
  const accTree = useMemo(() => {
    const tree = {};
    filtered.forEach(u => {
      const kat = u.kategori || 'Genel';
      const mrk = u.marka || 'Genel';
      const sup = u.supplier || 'Genel';
      if (!tree[kat]) tree[kat] = {};
      if (!tree[kat][mrk]) tree[kat][mrk] = {};
      if (!tree[kat][mrk][sup]) tree[kat][mrk][sup] = [];
      tree[kat][mrk][sup].push(u);
    });
    return tree;
  }, [filtered]);

  const bekleyenSayisi = siparisler.filter(s => s.durum === 'beklemede' || s.durum === 'kismi' || s.durum === 'hazirlaniyor').length;

  return (
    <div className="sip-3panel">
      {/* ── SOL: Katalog Accordion ── */}
      <div className="sip-panel sip-kat-panel">
        <div className="sip-panel-title">
          {t.katalog}
          <span className="sip-panel-count">{filtered.length}</span>
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.ara} className="sip-search" />
        <ChipFilter label={t.kategori} items={kategoriler} value={katFilter} onChange={setKatFilter} />
        <ChipFilter label={t.marka} items={markalar} value={markaFilter} onChange={setMarkaFilter} />
        <ChipFilter label={t.supplier} items={suppliers} value={supplierFilter} onChange={setSupplierFilter} />

        <div style={{ marginTop: 10 }}>
          {Object.keys(accTree).length === 0 && <div className="sip-empty">{t.bos_katalog}</div>}
          {Object.entries(accTree).sort((a, b) => a[0].localeCompare(b[0])).map(([kat, markalar2]) => (
            <AccordionLevel key={kat} label={kat} count={Object.values(markalar2).reduce((s, sups) => s + Object.values(sups).reduce((s2, arr) => s2 + arr.length, 0), 0)}>
              {Object.entries(markalar2).sort((a, b) => a[0].localeCompare(b[0])).map(([mrk, supMap]) => (
                <AccordionLevel key={mrk} label={mrk} count={Object.values(supMap).reduce((s, arr) => s + arr.length, 0)} sub>
                  {Object.entries(supMap).sort((a, b) => a[0].localeCompare(b[0])).map(([sup, items]) => (
                    <div key={sup}>
                      <div className="sip-acc-sub">{sup} <span className="sip-acc-sub-count">({items.length})</span></div>
                      {items.map(u => (
                        <div key={u.kod} className="sip-urun-card" onClick={() => sepeteEkle(u.kod, u.ad, 1)}>
                          <span className="sip-urun-kod">
                            {u.kod}
                            {fiyatlar[u.kod]?.fiyat && <span className="sip-urun-fiyat">{fiyatlar[u.kod].fiyat} {fiyatlar[u.kod].doviz || 'USD'}</span>}
                          </span>
                          <span className={`sip-stok-dot ${u.stokVar ? 'sip-stok-var' : 'sip-stok-yok'}`} />
                        </div>
                      ))}
                    </div>
                  ))}
                </AccordionLevel>
              ))}
            </AccordionLevel>
          ))}
        </div>
      </div>

      {/* ── ORTA: Sipariş Formu ── */}
      <div className="sip-panel">
        {/* Mobil sub-tab toggle */}
        <div className="sip-mobile-subtabs">
          <button className={`sip-page-tab ${mobileView === 'form' ? 'active' : ''}`} onClick={() => setMobileView('form')}>
            {t.siparis} {sepet.length > 0 && <span className="sip-badge sip-badge-bekle">{sepet.length}</span>}
          </button>
          <button className={`sip-page-tab ${mobileView === 'takip' ? 'active' : ''}`} onClick={() => setMobileView('takip')}>
            {t.takip} {bekleyenSayisi > 0 && <span className="sip-badge sip-badge-bekle">{bekleyenSayisi}</span>}
          </button>
        </div>

        {/* Mobil arama (mobilde sol panel yok) */}
        <div className="sip-mobile-search">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.ara} className="sip-search" />
        </div>

        {/* Form view (desktop: her zaman; mobil: mobileView=form) */}
        <div className={`sip-form-view ${mobileView !== 'form' ? 'sip-hide-mobile' : ''}`}>
          <SepetPanel
            t={t} sepet={sepet} fiyatlar={fiyatlar} katalog={katalog} filtered={filtered}
            busy={busy} onSil={sepettenSil} onAdetGuncelle={sepetAdetGuncelle}
            onEkle={sepeteEkle} onGonder={siparisGonder} sikAlinanlar={sikAlinanlar} showToast={showToast}
          />
        </div>

        {/* Takip view (mobilde mobileView=takip) */}
        <div className={`sip-takip-view ${mobileView !== 'takip' ? 'sip-hide-mobile' : ''} sip-hide-desktop`}>
          <TakipPanel
            t={t} siparisler={siparisler} fiyatlar={fiyatlar} busy={busy}
            onGrupSil={siparisSil} onKalemGuncelle={kalemGuncelle} onKalemSil={kalemSil}
          />
        </div>
      </div>

      {/* ── SAĞ: Takip (desktop only) ── */}
      <div className="sip-panel">
        <div className="sip-panel-title">
          {t.takip}
          {bekleyenSayisi > 0 && <span className="sip-panel-count">{bekleyenSayisi}</span>}
        </div>
        <TakipPanel
          t={t} siparisler={siparisler} fiyatlar={fiyatlar} busy={busy}
          onGrupSil={siparisSil} onKalemGuncelle={kalemGuncelle} onKalemSil={kalemSil}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Sub-Components
// ══════════════════════════════════════════════════════

// ── Chip Filter ─────────────────────────────────────
function ChipFilter({ label, items, value, onChange }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--sip-text-muted)', marginBottom: 4 }}>{label}</div>
      <div className="sip-filter-row">
        {items.map(item => (
          <button key={item} className={`sip-chip ${value === item ? 'active' : ''}`}
            onClick={() => onChange(value === item ? '' : item)}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Accordion Level ─────────────────────────────────
function AccordionLevel({ label, count, sub, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sip-acc">
      <div className={`sip-acc-head ${open ? 'open' : ''} ${sub ? 'sip-acc-sub' : ''}`} onClick={() => setOpen(o => !o)}>
        <span>{label} <span className="sip-acc-sub-count">({count})</span></span>
        <span className="sip-acc-arrow">▶</span>
      </div>
      {open && <div className="sip-acc-body">{children}</div>}
    </div>
  );
}

// ── Simetrik Arama Barı (tek component, üst+alt) ────
function SearchAddBar({ katalog, placeholder, onAdd, onSelect }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const results = useMemo(() => {
    if (!input || input.length < 2) return [];
    const s = input.toLowerCase();
    return katalog.filter(u => u.kod?.toLowerCase().includes(s) || u.ad?.toLowerCase().includes(s) || u.parcaNo?.toLowerCase().includes(s)).slice(0, 8);
  }, [input, katalog]);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function handleSelect(u) { onSelect(u); setInput(''); setOpen(false); }
  function handleEnter() {
    if (results.length > 0) handleSelect(results[0]);
    else if (input.trim()) { onAdd(input); setInput(''); setOpen(false); }
  }

  return (
    <div className="sip-ac-wrap" ref={ref}>
      <input type="text" value={input}
        onChange={e => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => input.length >= 2 && setOpen(true)}
        onKeyDown={e => { if (e.key === 'Enter') handleEnter(); }}
        placeholder={placeholder} className="sip-search" />
      {open && results.length > 0 && (
        <div className="sip-ac-dropdown">
          {results.map(u => (
            <div key={u.kod} className="sip-ac-item" onClick={() => handleSelect(u)}>
              <span>{u.kod} — {u.ad}</span>
              <span className={`sip-stok-dot ${u.stokVar ? 'sip-stok-var' : 'sip-stok-yok'}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sepet Panel (Orta) ──────────────────────────────
function SepetPanel({ t, sepet, fiyatlar, katalog, filtered, busy, onSil, onAdetGuncelle, onEkle, onGonder, sikAlinanlar, showToast }) {
  const excelRef = useRef(null);
  const [excelBusy, setExcelBusy] = useState(false);

  async function sablonIndir() {
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([SABLON_SUTUNLAR, ...SABLON_ORNEK]);
      ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 8 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Sipariş');
      XLSX.writeFile(wb, 'Bekilli_Siparis_Sablon.xlsx');
    } catch (e) { console.warn('Şablon hatası:', e.message); }
  }

  async function excelYukle(file) {
    if (!file) return;
    setExcelBusy(true);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) { if (showToast) showToast('Dosya boş'); setExcelBusy(false); return; }
      let n = 0;
      rows.forEach(row => {
        const kod = String(row['ÜRÜN KODU'] || row['URUN KODU'] || row['KOD'] || row['CODE'] || Object.values(row)[0] || '').trim().toUpperCase();
        if (!kod) return;
        const ad = String(row['ÜRÜN ADI (opsiyonel)'] || row['ÜRÜN ADI'] || row['AD'] || row['NAME'] || '').trim();
        const adet = Math.max(1, parseInt(row['ADET'] || row['QTY'] || 1) || 1);
        const not = String(row['NOT'] || row['NOTE'] || '').trim();
        const found = katalog.find(u => u.kod?.toUpperCase() === kod || u.parcaNo?.toUpperCase() === kod);
        if (found) onEkle(found.kod, found.ad, adet, not);
        else { const p = kod.split('-'); onEkle(kod, ad || kod, adet, not, { parcaNo: p[0], supplier: p[1] || '', kategori: '' }); }
        n++;
      });
      if (showToast) showToast(`${n} ürün Excel'den eklendi`);
    } catch (e) { if (showToast) showToast('Excel okunamadı: ' + e.message); }
    setExcelBusy(false);
    if (excelRef.current) excelRef.current.value = '';
  }

  function handleAddByKod(kod) {
    if (!kod.trim()) return;
    const found = katalog.find(u => u.kod?.toLowerCase() === kod.trim().toLowerCase() || u.parcaNo?.toLowerCase() === kod.trim().toLowerCase());
    if (found) onEkle(found.kod, found.ad, 1);
    else { const p = kod.trim().toUpperCase().split('-'); onEkle(p.join('-'), p.join('-'), 1, '', { parcaNo: p[0], supplier: p[1] || '', kategori: '' }); }
  }

  const sepetOzet = useMemo(() => {
    let fiyatliToplam = 0, fiyatSorulacak = 0, topAdet = 0;
    sepet.forEach(item => {
      topAdet += item.adet;
      const f = fiyatlar[item.urunKod];
      if (f?.fiyat) fiyatliToplam += item.adet * f.fiyat; else fiyatSorulacak++;
    });
    return { fiyatliToplam, fiyatSorulacak, topAdet, doviz: Object.values(fiyatlar).find(f => f?.doviz)?.doviz || 'USD' };
  }, [sepet, fiyatlar]);

  return (
    <div>
      <div className="sip-panel-title">
        {t.siparis}
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="sip-btn sip-btn-secondary" onClick={sablonIndir} style={{ fontSize: 9, padding: '4px 8px' }}>↓ Şablon</button>
          <button className="sip-btn sip-btn-secondary" onClick={() => excelRef.current?.click()} disabled={excelBusy}
            style={{ fontSize: 9, padding: '4px 8px' }}>{excelBusy ? '...' : '↑ Excel'}</button>
        </div>
      </div>
      <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) excelYukle(e.target.files[0]); }} />

      {/* Üst arama barı */}
      <SearchAddBar katalog={katalog} placeholder={t.ekle_placeholder} onAdd={handleAddByKod} onSelect={u => onEkle(u.kod, u.ad, 1)} />

      {/* Sepet listesi */}
      {sepet.length === 0 ? (
        <div className="sip-empty">{t.sepet_bos}</div>
      ) : (
        <div className="sip-form-card">
          <div className="sip-form-header">
            <span>{sepet.length} {t.satirlar}</span>
            <span className="sip-form-total">{sepetOzet.topAdet} {t.topAdet}</span>
          </div>
          {sepet.map(item => {
            const f = fiyatlar[item.urunKod];
            const satirToplam = f?.fiyat ? item.adet * f.fiyat : null;
            return (
              <div key={item.id} className="sip-kalem-row">
                <span className="sip-kalem-ad">
                  {item.urunAd}
                  {item.yeniUrunData && <span className="sip-badge sip-badge-hazir" style={{ marginLeft: 4, fontSize: 8 }}>NEW</span>}
                </span>
                <input type="number" min="1" max="99999" value={item.adet}
                  onChange={e => onAdetGuncelle(item.id, e.target.value)} className="sip-kalem-adet" />
                <span className="sip-kalem-tutar">
                  {satirToplam != null ? `${satirToplam.toLocaleString()} ${f.doviz || 'USD'}` : '?'}
                </span>
                <button className="sip-kalem-sil" onClick={() => onSil(item.id)}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Alt arama barı (simetrik) */}
      <SearchAddBar katalog={katalog} placeholder={t.ekle_placeholder} onAdd={handleAddByKod} onSelect={u => onEkle(u.kod, u.ad, 1)} />

      {/* Toplam + Gönder */}
      {sepet.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--sip-text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>{t.fiyatli_toplam}</span>
            <span>{sepetOzet.fiyatliToplam.toLocaleString()} {sepetOzet.doviz}</span>
          </div>
          {sepetOzet.fiyatSorulacak > 0 && (
            <div style={{ fontSize: 11, color: 'var(--sip-warning-text)', marginBottom: 4 }}>
              {sepetOzet.fiyatSorulacak} {t.satirlar} — {t.fiyat_sorun_kalem}
            </div>
          )}
          <div className="sip-btn-row">
            <button className="sip-btn sip-btn-primary" onClick={onGonder} disabled={busy} style={{ flex: 1 }}>
              {busy ? t.gonderiliyor : t.gonder}
            </button>
          </div>
        </div>
      )}

      {/* Sık alınanlar */}
      {sikAlinanlar && sikAlinanlar.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="sip-chips-label">{t.sik_alinanlar || 'Sık Alınanlar'}</div>
          <div className="sip-chips">
            {sikAlinanlar.slice(0, 12).map(kod => (
              <button key={kod} className="sip-chip" onClick={() => { const u = katalog.find(x => x.kod === kod); onEkle(kod, u?.ad || kod, 1); }}>{kod}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Takip Panel (Sağ) ───────────────────────────────
function TakipPanel({ t, siparisler, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil }) {
  const beklemede = siparisler.filter(s => s.durum === 'beklemede');
  const hazirlaniyor = siparisler.filter(s => s.durum === 'hazirlaniyor');
  const kismi = siparisler.filter(s => s.durum === 'kismi');
  const tamamlandi = siparisler.filter(s => s.durum === 'tamamlandi');
  const iptal = siparisler.filter(s => s.durum === 'iptal');

  if (siparisler.length === 0) return <div className="sip-empty">{t.bos_siparis}</div>;

  return (
    <div>
      {beklemede.length > 0 && <StatusGroup label={t.beklemede} status="bekle" items={beklemede} t={t} fiyatlar={fiyatlar} busy={busy} onGrupSil={onGrupSil} onKalemGuncelle={onKalemGuncelle} onKalemSil={onKalemSil} />}
      {hazirlaniyor.length > 0 && <StatusGroup label={t.hazirlaniyor} status="hazir" items={hazirlaniyor} t={t} fiyatlar={fiyatlar} busy={busy} />}
      {kismi.length > 0 && <StatusGroup label={t.kismi} status="kismi" items={kismi} t={t} fiyatlar={fiyatlar} busy={busy} />}
      {tamamlandi.length > 0 && <StatusGroup label={t.tamamlandi} status="tamam" items={tamamlandi} t={t} fiyatlar={fiyatlar} busy={busy} collapsed />}
      {iptal.length > 0 && <StatusGroup label={t.iptal_durum} status="iptal" items={iptal} t={t} fiyatlar={fiyatlar} busy={busy} collapsed />}
    </div>
  );
}

// ── Status Group ────────────────────────────────────
function StatusGroup({ label, status, items, t, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil, collapsed: initialCollapsed }) {
  const [collapsed, setCollapsed] = useState(!!initialCollapsed);

  return (
    <div className="sip-status-section">
      <div className="sip-status-label" onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer' }}>
        <span className={`sip-badge sip-badge-${status}`}>{items.length}</span>
        {label}
        <span className="sip-acc-arrow" style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>▶</span>
      </div>
      {!collapsed && items.map(grup => (
        <SiparisCard key={grup.id} grup={grup} t={t} fiyatlar={fiyatlar} busy={busy}
          onGrupSil={onGrupSil} onKalemGuncelle={onKalemGuncelle} onKalemSil={onKalemSil} />
      ))}
    </div>
  );
}

// ── Sipariş Card ────────────────────────────────────
function SiparisCard({ grup, t, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil }) {
  const [open, setOpen] = useState(false);
  const kalemler = grup.kalemler || [];
  const tarih = new Date(grup.tarih).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const topKalem = kalemler.length;
  const topAdet = kalemler.reduce((s, k) => s + k.adet, 0);
  const topKarsilanan = kalemler.reduce((s, k) => s + (k.karsilanan || 0), 0);
  const editable = grup.durum === 'beklemede' && topKarsilanan === 0;

  // Progress
  const progress = topAdet > 0 ? (topKarsilanan / topAdet) * 100 : 0;
  const hazirProgress = topAdet > 0 ? (kalemler.reduce((s, k) => s + (k.hazirlanan || 0), 0) / topAdet) * 100 : 0;

  return (
    <div className="sip-sip-card" onClick={() => setOpen(o => !o)}>
      <div className="sip-sip-card-header">
        <span className="sip-sip-card-id">{topKalem} {t.satirlar}</span>
        <span className="sip-sip-card-date">{tarih}</span>
      </div>
      <div className="sip-sip-card-sub">
        {topKarsilanan > 0 ? `${topKarsilanan}/` : ''}{topAdet} {t.topAdet}
      </div>
      {(progress > 0 || hazirProgress > 0) && (
        <div className="sip-progress">
          <div className={`sip-progress-fill sip-pf-${grup.durum}`}
            style={{ width: `${Math.max(progress, hazirProgress)}%` }} />
        </div>
      )}

      {open && (
        <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
          {kalemler.map(k => (
            <KalemRow key={k.id} k={k} grupId={grup.id} t={t} fiyat={fiyatlar[k.urunKod]}
              editable={editable} busy={busy} onGuncelle={onKalemGuncelle} onSil={onKalemSil}
              karsilamalar={grup.karsilamalar} />
          ))}
          {editable && onGrupSil && (
            <div className="sip-btn-row" style={{ marginTop: 8 }}>
              <button className="sip-btn sip-btn-danger" onClick={() => onGrupSil(grup.id)} disabled={busy}>{t.sil}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kalem Row ───────────────────────────────────────
function KalemRow({ k, grupId, t, fiyat, editable, busy, onGuncelle, onSil, karsilamalar }) {
  const [editMode, setEditMode] = useState(false);
  const [yeniAdet, setYeniAdet] = useState(String(k.adet));

  function handleSave() {
    const a = parseInt(yeniAdet);
    if (a && a !== k.adet && a >= 1) onGuncelle?.(grupId, k.id, a);
    setEditMode(false);
  }

  // B2: Karşılama fiyatı
  const kalemKarsilamalar = (karsilamalar || []).filter(x => x.kalemId === k.id && x.miktar > 0);
  const sonKarsilama = kalemKarsilamalar.length > 0 ? kalemKarsilamalar[kalemKarsilamalar.length - 1] : null;
  const muadilKarsilama = kalemKarsilamalar.find(x => x.muadilKod);

  const fmtPara = (f, doviz) => {
    const sym = doviz === 'USD' ? '$' : doviz === 'EUR' ? '€' : doviz === 'TRY' ? '₺' : (doviz + ' ');
    return `${sym}${f.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="sip-kalem-row" style={{ flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sip-kalem-ad">{k.urunAd}</div>
        <div style={{ fontSize: 10, color: 'var(--sip-text-muted)' }}>{k.urunKod}</div>
        {/* M4: Hazırlanıyor */}
        {(k.hazirlanan || 0) > 0 && k.karsilanan < k.adet && (
          <span className="sip-badge sip-badge-hazir" style={{ fontSize: 8, marginTop: 2 }}>🔧 {k.hazirlanan} hazırlanıyor</span>
        )}
        {/* M11: Muadil — orijinal ürün parantez içinde */}
        {muadilKarsilama && (
          <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 600, color: 'var(--sip-warning-text)', background: 'var(--sip-warning-bg)', padding: '1px 6px', borderRadius: 4, marginTop: 2 }}>
            {muadilKarsilama.muadilKod}{muadilKarsilama.muadilAd ? ` — ${muadilKarsilama.muadilAd}` : ''} ile gönderildi
            <span style={{ opacity: 0.7, marginLeft: 4 }}>(orijinal: {k.urunKod})</span>
          </span>
        )}
        {/* D2: İade */}
        {(k.iadeler || []).length > 0 && (() => {
          const topIade = k.iadeler.reduce((s, i) => s + (i.miktar || 0), 0);
          return (
            <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 600, color: 'var(--sip-danger-text)', background: 'var(--sip-danger-bg)', padding: '1px 6px', borderRadius: 4, marginTop: 2 }}>
              {topIade} iade · Net: {(k.karsilanan || 0) - topIade}
            </span>
          );
        })()}
      </div>
      <div style={{ textAlign: 'right', fontSize: 11 }}>
        {k.karsilanan > 0 && <span style={{ color: 'var(--sip-accent)' }}>{k.karsilanan}/</span>}
        <span style={{ fontWeight: 600 }}>{k.adet}</span>
        {fiyat?.fiyat ? (
          <div style={{ fontSize: 10, color: 'var(--sip-text-muted)' }}>
            {fmtPara(fiyat.fiyat, fiyat.doviz || 'USD')} × {k.adet} = <strong>{fmtPara(fiyat.fiyat * k.adet, fiyat.doviz || 'USD')}</strong>
          </div>
        ) : sonKarsilama?.fiyat ? (
          <div style={{ fontSize: 10, color: 'var(--sip-text-muted)' }}>{fmtPara(sonKarsilama.fiyat, sonKarsilama.doviz || 'USD')}/ad</div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--sip-text-faint)' }}>{t.fiyat_sorun_kalem}</div>
        )}
      </div>
      {editable && onSil && !editMode && (
        <div style={{ display: 'flex', gap: 4, width: '100%', marginTop: 4 }}>
          <button className="sip-btn sip-btn-secondary" onClick={() => { setYeniAdet(String(k.adet)); setEditMode(true); }} disabled={busy} style={{ fontSize: 10 }}>{t.adet}</button>
          <button className="sip-btn sip-btn-danger" onClick={() => onSil(grupId, k.id)} disabled={busy} style={{ fontSize: 10 }}>{t.sil}</button>
        </div>
      )}
      {editMode && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', width: '100%', marginTop: 4 }}>
          <input type="number" min="1" max="99999" value={yeniAdet} onChange={e => setYeniAdet(e.target.value)}
            className="sip-input" style={{ width: 60, textAlign: 'center', fontSize: 14 }} />
          <button className="sip-btn sip-btn-primary" onClick={handleSave} disabled={busy} style={{ fontSize: 10 }}>{t.guncelle}</button>
          <button className="sip-btn sip-btn-secondary" onClick={() => setEditMode(false)} style={{ fontSize: 10 }}>{t.iptal_btn}</button>
        </div>
      )}
    </div>
  );
}
