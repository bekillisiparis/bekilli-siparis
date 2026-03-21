import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// ── API ─────────────────────────────────────────────
const API = '/api/siparis';

async function apiCall(endpoint, pin, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (pin) headers['X-Siparis-PIN'] = pin;
  const opts = body
    ? { method: 'POST', headers, body: JSON.stringify(body) }
    : { method: 'GET', headers };
  const res = await fetch(endpoint, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.hata || 'Bir hata oluştu');
  return data;
}

// ── Fiyat helper ────────────────────────────────────
// v2 format: { fiyatlar: { "kod": { fiyat, doviz } } }
// v1 / boş: {} veya { "kod": { fiyat, doviz } }
function extractFiyatlar(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.fiyatlar && typeof raw.fiyatlar === 'object') return raw.fiyatlar;
  return raw;
}

// ── Dil ─────────────────────────────────────────────
const LANG = {
  tr: {
    pin_title: 'Bekilli Group', pin_sub: 'Sipariş Sistemi',
    pin_placeholder: '6 haneli PIN giriniz', pin_btn: 'Giriş',
    pin_error: 'Geçersiz PIN', yukleniyor: 'Yükleniyor...',
    cikis: 'Çıkış', hata: 'Hata', tekrar: 'Tekrar dene',
    baglanamadi: 'Sunucuya bağlanılamadı',
    // Filtreler
    tumu: 'Tümü', kategori: 'Kategori', marka: 'Marka', supplier: 'Supplier',
    ara: 'Ürün ara...',
    stokta: 'Stokta', stok_yok: 'Yok', fiyat_sorun: 'Fiyat sorulacak',
    // Sağ panel
    siparis: 'Sipariş', takip: 'Takip', hesabim: 'Hesabım',
    sepet_bos: 'Henüz ürün eklenmedi',
    adet: 'Adet', urun: 'Ürün', birim: 'Birim', toplam: 'Toplam',
    satirlar: 'kalem', topAdet: 'adet',
    fiyatli_toplam: 'Fiyatı belli', fiyat_sorun_kalem: 'Fiyat sorulacak',
    gonder: 'Sipariş Gönder', gonderiliyor: 'Gönderiliyor...',
    gonderildi: 'sipariş gönderildi',
    sepetten_sil: 'Sil', adet_gir: 'Ad.',
    ekle_placeholder: 'Parça no veya ürün adı yazın...',
    // Takip
    beklemede: 'Beklemede', kismi: 'Kısmi',
    tamamlandi: 'Tamamlandı', iptal_durum: 'İptal',
    karsilanan: 'karşılandı', bos_siparis: 'Henüz sipariş yok',
    sil: 'Sil', guncelle: 'Güncelle', iptal_btn: 'İptal',
    // Yeni ürün
    yeni_urun: 'Yeni ürün ekle',
    parca_no: 'Parça No', supplier_label: 'Üretici',
    urun_ad: 'Ürün Adı', not_placeholder: 'Not (isteğe bağlı)',
    // Hesabım
    hesabim_yakin: 'Hesabım yakında aktif olacak.',
    bakiye: 'Bakiye', faturalar: 'Faturalar', odemeler: 'Ödemeler',
    bos_katalog: 'Katalog boş',
  },
  en: {
    pin_title: 'Bekilli Group', pin_sub: 'Order System',
    pin_placeholder: 'Enter 6-digit PIN', pin_btn: 'Login',
    pin_error: 'Invalid PIN', yukleniyor: 'Loading...',
    cikis: 'Logout', hata: 'Error', tekrar: 'Try again',
    baglanamadi: 'Cannot connect to server',
    tumu: 'All', kategori: 'Category', marka: 'Brand', supplier: 'Supplier',
    ara: 'Search products...',
    stokta: 'In Stock', stok_yok: 'N/A', fiyat_sorun: 'Price on request',
    siparis: 'Order', takip: 'Tracking', hesabim: 'Account',
    sepet_bos: 'No items added yet',
    adet: 'Qty', urun: 'Product', birim: 'Unit', toplam: 'Total',
    satirlar: 'items', topAdet: 'pcs',
    fiyatli_toplam: 'Priced total', fiyat_sorun_kalem: 'Price on request',
    gonder: 'Send Order', gonderiliyor: 'Sending...',
    gonderildi: 'orders sent',
    sepetten_sil: 'Remove', adet_gir: 'Qty',
    ekle_placeholder: 'Type part no or product name...',
    beklemede: 'Pending', kismi: 'Partial',
    tamamlandi: 'Completed', iptal_durum: 'Cancelled',
    karsilanan: 'fulfilled', bos_siparis: 'No orders yet',
    sil: 'Remove', guncelle: 'Update', iptal_btn: 'Cancel',
    yeni_urun: 'Add new product',
    parca_no: 'Part No', supplier_label: 'Manufacturer',
    urun_ad: 'Product Name', not_placeholder: 'Note (optional)',
    hesabim_yakin: 'Account section coming soon.',
    bakiye: 'Balance', faturalar: 'Invoices', odemeler: 'Payments',
    bos_katalog: 'Catalog is empty',
  },
};

// Suppliers ve kategoriler artık API'den geliyor (K0.10 — tek kaynak)

// ── App ─────────────────────────────────────────────
export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('sip_lang') || 'tr');
  const [theme, setTheme] = useState(() => localStorage.getItem('sip_theme') || 'light');
  const [pin, setPin] = useState(() => sessionStorage.getItem('sip_pin') || '');
  const [musteri, setMusteri] = useState(null);
  const [katalog, setKatalog] = useState([]);
  const [apiSuppliers, setApiSuppliers] = useState([]);
  const [apiKategoriler, setApiKategoriler] = useState([]);
  const [fiyatlar, setFiyatlar] = useState({});
  const [siparisler, setSiparisler] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const t = LANG[lang];
  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  useEffect(() => { fetch(API).catch(e => console.warn('Preheat:', e.message)); }, []);
  useEffect(() => { localStorage.setItem('sip_lang', lang); }, [lang]);
  useEffect(() => {
    localStorage.setItem('sip_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => { if (pin && !loggedIn) doLogin(pin); }, []); // eslint-disable-line

  async function doLogin(p) {
    setLoading(true);
    setError('');
    try {
      const [userData, katData] = await Promise.all([
        apiCall(API, p),
        apiCall(`${API}?katalog=1`),
      ]);
      setMusteri({ id: userData.musteriId, ad: userData.musteriAd });
      setSiparisler(userData.siparisler || []);
      setFiyatlar(extractFiyatlar(userData.fiyatlar));
      setKatalog(katData.urunler || []);
      setApiSuppliers(katData.suppliers || []);
      setApiKategoriler(katData.kategoriler || []);
      // K0.12: API versiyon uyumluluk kontrolü
      if (katData.apiVersion && !katData.apiVersion.startsWith('2.')) {
        console.warn('Katalog API versiyonu uyumsuz:', katData.apiVersion);
      }
      sessionStorage.setItem('sip_pin', p);
      setPin(p);
      setLoggedIn(true);
    } catch (err) {
      setError(err.message);
      sessionStorage.removeItem('sip_pin');
    }
    setLoading(false);
  }

  function doLogout() {
    sessionStorage.removeItem('sip_pin');
    setPin(''); setMusteri(null); setLoggedIn(false);
    setSiparisler([]); setFiyatlar({}); setKatalog([]);
    setApiSuppliers([]); setApiKategoriler([]);
  }

  async function refreshSiparisler() {
    try {
      const data = await apiCall(API, pin);
      setSiparisler(data.siparisler || []);
    } catch (err) { console.warn('Sipariş yenileme hatası:', err.message); }
  }

  if (!loggedIn) {
    return <LoginScreen t={t} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} loading={loading} error={error} onLogin={doLogin} />;
  }

  return (
    <MainApp
      t={t} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} pin={pin}
      musteri={musteri} katalog={katalog} fiyatlar={fiyatlar}
      siparisler={siparisler} refreshSiparisler={refreshSiparisler}
      onLogout={doLogout}
    />
  );
}

// ── Login ───────────────────────────────────────────
function LoginScreen({ t, lang, setLang, theme, toggleTheme, loading, error, onLogin }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="sip-login-container">
      <div className="sip-login-card">
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6 }}>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <LangToggle lang={lang} setLang={setLang} />
        </div>
        <div className="sip-login-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
        <h1 className="sip-login-title">{t.pin_title}</h1>
        <p className="sip-login-sub">{t.pin_sub}</p>
        <div className="sip-login-form">
          <input
            ref={inputRef} type="password" inputMode="numeric" maxLength={6}
            value={input} onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
            placeholder={t.pin_placeholder} className="sip-pin-input" autoComplete="off"
            onKeyDown={e => { if (e.key === 'Enter' && input.length === 6) onLogin(input); }}
          />
          <button
            onClick={() => input.length === 6 && onLogin(input)}
            disabled={input.length !== 6 || loading} className="sip-pin-btn"
          >
            {loading ? t.yukleniyor : t.pin_btn}
          </button>
        </div>
        {error && <p className="sip-login-error">{t.pin_error}</p>}
      </div>
    </div>
  );
}

// ── MainApp — 3 Panel Desktop ───────────────────────
function MainApp({ t, lang, setLang, theme, toggleTheme, pin, musteri, katalog, fiyatlar, siparisler, refreshSiparisler, onLogout }) {
  const [tab, setTab] = useState('siparis');
  const [sepet, setSepet] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  // Filters
  const [katFilter, setKatFilter] = useState('');
  const [markaFilter, setMarkaFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [search, setSearch] = useState('');
  // Mobile bottom sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  // ── Sepete ekle (lokal) ──────────────────────────
  const sepeteEkle = useCallback((urunKod, urunAd, adet, not, yeniUrunData) => {
    const qty = parseInt(adet) || 1;
    setSepet(prev => {
      const existing = prev.find(s => s.urunKod === urunKod);
      if (existing) {
        return prev.map(s => s.urunKod === urunKod ? { ...s, adet: s.adet + qty } : s);
      }
      return [...prev, { id: Date.now(), urunKod, urunAd: urunAd || urunKod, adet: qty, not: not || '', yeniUrunData }];
    });
    showToast(`${urunKod} eklendi`);
    if (tab !== 'siparis') setTab('siparis');
  }, [tab]);

  // ── Sepetten sil ─────────────────────────────────
  function sepettenSil(id) { setSepet(prev => prev.filter(s => s.id !== id)); }

  // ── Sepet adet güncelle ──────────────────────────
  function sepetAdetGuncelle(id, yeniAdet) {
    const a = parseInt(yeniAdet);
    if (!a || a < 1) return;
    setSepet(prev => prev.map(s => s.id === id ? { ...s, adet: a } : s));
  }

  // ── Sipariş gönder (tüm sepet → tek grup) ────────
  async function siparisGonder() {
    if (sepet.length === 0 || busy) return;
    setBusy(true);
    try {
      const kalemler = sepet.map(item => {
        const k = { urunKod: item.urunKod, urunAd: item.urunAd, adet: item.adet, not: item.not || '' };
        if (item.yeniUrunData) {
          k.yeniUrun = true;
          k.parcaNo = item.yeniUrunData.parcaNo;
          k.supplier = item.yeniUrunData.supplier;
          k.kategori = item.yeniUrunData.kategori;
        }
        return k;
      });
      await apiCall(API, pin, { islem: 'ekle', kalemler });
      await refreshSiparisler();
      setSepet([]);
      showToast(`${kalemler.length} ${t.satirlar} ${t.gonderildi}`);
      setTab('takip');
      setSheetOpen(false);
    } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }

  // ── Takip: sipariş sil ──────────────────────────
  // ── Takip: sipariş grubu sil ─────────────────────
  async function siparisSil(siparisId) {
    setBusy(true);
    try {
      await apiCall(API, pin, { islem: 'sil', siparisId });
      await refreshSiparisler();
    } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }

  // ── Takip: kalem adet güncelle ──────────────────
  async function kalemGuncelle(siparisId, kalemId, adet) {
    setBusy(true);
    try {
      await apiCall(API, pin, { islem: 'guncelle', siparisId, kalemId, adet: parseInt(adet) });
      await refreshSiparisler();
    } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }

  // ── Takip: kalem sil ───────────────────────────
  async function kalemSil(siparisId, kalemId) {
    setBusy(true);
    try {
      await apiCall(API, pin, { islem: 'kalem_sil', siparisId, kalemId });
      await refreshSiparisler();
    } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }

  // ── Derived data ─────────────────────────────────
  const kategoriler = useMemo(() => [...new Set(katalog.map(u => u.kategori).filter(Boolean))].sort(), [katalog]);
  const markalar = useMemo(() => [...new Set(katalog.map(u => u.marka).filter(Boolean))].sort(), [katalog]);
  const suppliers = useMemo(() => [...new Set(katalog.map(u => u.supplier).filter(Boolean))].sort(), [katalog]);

  const filtered = useMemo(() => {
    let list = katalog;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(u => u.ad?.toLowerCase().includes(s) || u.kod?.toLowerCase().includes(s) || u.parcaNo?.toLowerCase().includes(s) || u.marka?.toLowerCase().includes(s));
    }
    if (katFilter) list = list.filter(u => u.kategori === katFilter);
    if (markaFilter) list = list.filter(u => u.marka === markaFilter);
    if (supplierFilter) list = list.filter(u => u.supplier === supplierFilter);
    return list;
  }, [katalog, search, katFilter, markaFilter, supplierFilter]);

  // Supplier grupla
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(u => {
      const key = u.supplier || 'Genel';
      if (!map[key]) map[key] = [];
      map[key].push(u);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const bekleyenSayisi = siparisler.filter(s => s.durum === 'beklemede' || s.durum === 'kismi').length;

  return (
    <div className="sip-app">
      {/* Header */}
      <header className="sip-header">
        <div className="sip-header-left">
          <div className="sip-header-logo">Bekilli Group</div>
          <div className="sip-header-customer">{musteri.ad}</div>
        </div>
        <div className="sip-header-right">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <LangToggle lang={lang} setLang={setLang} />
          <button onClick={onLogout} className="sip-logout-btn">{t.cikis}</button>
        </div>
      </header>

      {/* 3 Panel Body */}
      <div className="sip-body">
        {/* SOL: Filtreler (desktop only) */}
        <aside className="sip-left">
          <FilterSection title={t.kategori} items={kategoriler} value={katFilter} onChange={setKatFilter} allLabel={t.tumu} />
          <FilterSection title={t.marka} items={markalar} value={markaFilter} onChange={setMarkaFilter} allLabel={t.tumu} />
          <FilterSection title={t.supplier} items={suppliers} value={supplierFilter} onChange={setSupplierFilter} allLabel={t.tumu} />
        </aside>

        {/* ORTA: Katalog */}
        <div className="sip-mid">
          {/* Mobil: arama + filtre toggle */}
          <div className="sip-mid-topbar">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t.ara} className="sip-search"
            />
            <button className="sip-filter-toggle" onClick={() => setShowFilters(f => !f)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {(katFilter || markaFilter || supplierFilter) && <span className="sip-filter-dot" />}
            </button>
          </div>

          {/* Mobil filtre drawer */}
          {showFilters && (
            <div className="sip-mobile-filters">
              <FilterSection title={t.kategori} items={kategoriler} value={katFilter} onChange={v => { setKatFilter(v); }} allLabel={t.tumu} />
              <FilterSection title={t.marka} items={markalar} value={markaFilter} onChange={v => { setMarkaFilter(v); }} allLabel={t.tumu} />
              <FilterSection title={t.supplier} items={suppliers} value={supplierFilter} onChange={v => { setSupplierFilter(v); }} allLabel={t.tumu} />
              <button className="sip-filter-close" onClick={() => setShowFilters(false)}>{t.tumu} — {filtered.length} {t.urun}</button>
            </div>
          )}

          {grouped.length === 0 ? (
            <div className="sip-empty">{t.bos_katalog}</div>
          ) : (
            <div className="sip-katalog-list">
              {grouped.map(([supplier, items]) => (
                <div key={supplier} className="sip-supplier-group">
                  <div className="sip-supplier-label">{supplier}</div>
                  {items.map(u => (
                    <div key={u.kod} className="sip-katalog-item" onClick={() => sepeteEkle(u.kod, u.ad, 1)}>
                      <div className="sip-ki-info">
                        <div className="sip-ki-name">{u.ad}</div>
                        <div className="sip-ki-code">{u.kod}</div>
                      </div>
                      <span className={`sip-ki-stock ${u.stokVar ? 'in' : 'out'}`}>
                        {u.stokVar ? t.stokta : t.stok_yok}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SAĞ: Sipariş paneli (desktop) */}
        <div className="sip-right">
          <div className="sip-tabs">
            <button className={`sip-tab ${tab === 'siparis' ? 'active' : ''}`} onClick={() => setTab('siparis')}>
              {t.siparis}
              {sepet.length > 0 && <span className="sip-badge">{sepet.length}</span>}
            </button>
            <button className={`sip-tab ${tab === 'takip' ? 'active' : ''}`} onClick={() => setTab('takip')}>
              {t.takip}
              {bekleyenSayisi > 0 && <span className="sip-badge">{bekleyenSayisi}</span>}
            </button>
            <button className={`sip-tab ${tab === 'hesabim' ? 'active' : ''}`} onClick={() => setTab('hesabim')}>
              {t.hesabim}
            </button>
          </div>

          <div className="sip-tab-content">
            {tab === 'siparis' && (
              <SepetTab
                t={t} sepet={sepet} fiyatlar={fiyatlar} katalog={katalog}
                busy={busy} onSil={sepettenSil} onAdetGuncelle={sepetAdetGuncelle}
                onEkle={sepeteEkle} onGonder={siparisGonder}
              />
            )}
            {tab === 'takip' && (
              <TakipTab
                t={t} siparisler={siparisler} fiyatlar={fiyatlar}
                busy={busy} onGrupSil={siparisSil} onKalemGuncelle={kalemGuncelle} onKalemSil={kalemSil}
              />
            )}
            {tab === 'hesabim' && <HesabimTab t={t} />}
          </div>
        </div>
      </div>

      {/* ── MOBILE BOTTOM BAR (sabit, sadece mobilde görünür) ── */}
      <div className="sip-mobile-bar" onClick={() => setSheetOpen(true)}>
        <div className="sip-mb-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
          {sepet.length > 0 && <span className="sip-mb-badge">{sepet.length}</span>}
        </div>
        <div className="sip-mb-center">
          {sepet.length > 0 ? `${sepet.length} ${t.satirlar}` : t.siparis}
          {bekleyenSayisi > 0 && <span className="sip-mb-pending"> · {bekleyenSayisi} {t.beklemede}</span>}
        </div>
        <div className="sip-mb-chevron">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </div>
      </div>

      {/* ── MOBILE BOTTOM SHEET ── */}
      {sheetOpen && (
        <>
          <div className="sip-sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <div className="sip-sheet">
            <div className="sip-sheet-handle" onClick={() => setSheetOpen(false)}>
              <div className="sip-sheet-bar" />
            </div>
            <div className="sip-tabs">
              <button className={`sip-tab ${tab === 'siparis' ? 'active' : ''}`} onClick={() => setTab('siparis')}>
                {t.siparis}
                {sepet.length > 0 && <span className="sip-badge">{sepet.length}</span>}
              </button>
              <button className={`sip-tab ${tab === 'takip' ? 'active' : ''}`} onClick={() => setTab('takip')}>
                {t.takip}
                {bekleyenSayisi > 0 && <span className="sip-badge">{bekleyenSayisi}</span>}
              </button>
              <button className={`sip-tab ${tab === 'hesabim' ? 'active' : ''}`} onClick={() => setTab('hesabim')}>
                {t.hesabim}
              </button>
            </div>
            <div className="sip-sheet-content">
              {tab === 'siparis' && (
                <SepetTab
                  t={t} sepet={sepet} fiyatlar={fiyatlar} katalog={katalog}
                  busy={busy} onSil={sepettenSil} onAdetGuncelle={sepetAdetGuncelle}
                  onEkle={sepeteEkle} onGonder={siparisGonder}
                />
              )}
              {tab === 'takip' && (
                <TakipTab
                  t={t} siparisler={siparisler} fiyatlar={fiyatlar}
                  busy={busy} onGrupSil={siparisSil} onKalemGuncelle={kalemGuncelle} onKalemSil={kalemSil}
                />
              )}
              {tab === 'hesabim' && <HesabimTab t={t} />}
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && <div className="sip-toast">{toast}</div>}
    </div>
  );
}

// ── Filter Section ──────────────────────────────────
function FilterSection({ title, items, value, onChange, allLabel }) {
  return (
    <div className="sip-filter-section">
      <div className="sip-filter-title">{title}</div>
      <div
        className={`sip-filter-item ${!value ? 'active' : ''}`}
        onClick={() => onChange('')}
      >{allLabel}</div>
      {items.map(item => (
        <div
          key={item}
          className={`sip-filter-item ${value === item ? 'active' : ''}`}
          onClick={() => onChange(value === item ? '' : item)}
        >{item}</div>
      ))}
    </div>
  );
}

// ── Sepet Tab (Sağ Panel Ana Sekme) ─────────────────
function SepetTab({ t, sepet, fiyatlar, katalog, busy, onSil, onAdetGuncelle, onEkle, onGonder }) {
  // Autocomplete
  const [acInput, setAcInput] = useState('');
  const [acOpen, setAcOpen] = useState(false);
  const acRef = useRef(null);

  const acResults = useMemo(() => {
    if (!acInput || acInput.length < 2) return [];
    const s = acInput.toLowerCase();
    return katalog.filter(u =>
      u.kod?.toLowerCase().includes(s) || u.ad?.toLowerCase().includes(s) || u.parcaNo?.toLowerCase().includes(s)
    ).slice(0, 8);
  }, [acInput, katalog]);

  function acSelect(urun) {
    onEkle(urun.kod, urun.ad, 1);
    setAcInput('');
    setAcOpen(false);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) { if (acRef.current && !acRef.current.contains(e.target)) setAcOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Inline new row
  const [newAdet, setNewAdet] = useState('1');
  const [newKod, setNewKod] = useState('');
  const [newAcOpen, setNewAcOpen] = useState(false);
  const newRef = useRef(null);

  const newAcResults = useMemo(() => {
    if (!newKod || newKod.length < 2) return [];
    const s = newKod.toLowerCase();
    return katalog.filter(u =>
      u.kod?.toLowerCase().includes(s) || u.ad?.toLowerCase().includes(s) || u.parcaNo?.toLowerCase().includes(s)
    ).slice(0, 6);
  }, [newKod, katalog]);

  function newRowSelect(urun) {
    onEkle(urun.kod, urun.ad, parseInt(newAdet) || 1);
    setNewKod('');
    setNewAdet('1');
    setNewAcOpen(false);
  }

  function newRowAdd() {
    if (!newKod.trim()) return;
    // Katalogda yoksa yeni ürün olarak ekle
    const found = katalog.find(u => u.kod?.toLowerCase() === newKod.trim().toLowerCase());
    if (found) {
      onEkle(found.kod, found.ad, parseInt(newAdet) || 1);
    } else {
      // Parça no olarak algıla, supplier boş
      onEkle(newKod.trim().toUpperCase(), newKod.trim().toUpperCase(), parseInt(newAdet) || 1, '', {
        parcaNo: newKod.trim(), supplier: '', kategori: '',
      });
    }
    setNewKod('');
    setNewAdet('1');
    setNewAcOpen(false);
  }

  useEffect(() => {
    function handleClick(e) { if (newRef.current && !newRef.current.contains(e.target)) setNewAcOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Toplam hesapla
  const sepetOzet = useMemo(() => {
    let fiyatliToplam = 0;
    let fiyatSorulacak = 0;
    let topAdet = 0;
    sepet.forEach(item => {
      topAdet += item.adet;
      const f = fiyatlar[item.urunKod];
      if (f?.fiyat) {
        fiyatliToplam += item.adet * f.fiyat;
      } else {
        fiyatSorulacak++;
      }
    });
    const doviz = Object.values(fiyatlar).find(f => f?.doviz)?.doviz || 'USD';
    return { fiyatliToplam, fiyatSorulacak, topAdet, doviz };
  }, [sepet, fiyatlar]);

  return (
    <div className="sip-sepet-tab">
      {/* Autocomplete arama */}
      <div className="sip-ac-wrap" ref={acRef}>
        <input
          type="text" value={acInput}
          onChange={e => { setAcInput(e.target.value); setAcOpen(true); }}
          onFocus={() => acInput.length >= 2 && setAcOpen(true)}
          placeholder={t.ekle_placeholder}
          className="sip-ac-input"
        />
        {acOpen && acResults.length > 0 && (
          <div className="sip-ac-dropdown">
            {acResults.map(u => (
              <div key={u.kod} className="sip-ac-item" onClick={() => acSelect(u)}>
                <span>{u.kod} — {u.ad}</span>
                <span className={`sip-ac-stock ${u.stokVar ? 'in' : 'out'}`}>
                  {u.stokVar ? t.stokta : t.stok_yok}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sepet listesi */}
      {sepet.length === 0 ? (
        <div className="sip-empty">{t.sepet_bos}</div>
      ) : (
        <>
          <div className="sip-cart-header">
            <span>{t.adet}</span>
            <span>{t.urun}</span>
            <span style={{textAlign:'right'}}>{t.toplam}</span>
            <span></span>
          </div>
          {sepet.map(item => {
            const f = fiyatlar[item.urunKod];
            const satirToplam = f?.fiyat ? item.adet * f.fiyat : null;
            // Supplier'ı koddan çıkar (3264700-AMBAC → AMBAC)
            const parts = item.urunKod.split('-');
            const supplier = parts.length > 1 ? parts[parts.length - 1] : '';
            return (
              <div key={item.id} className="sip-cart-row">
                <input
                  type="number" min="1" max="99999" value={item.adet}
                  onChange={e => onAdetGuncelle(item.id, e.target.value)}
                  className="sip-cr-adet"
                />
                <div className="sip-cr-urun">
                  <span className="sip-cr-name">{item.urunAd}</span>
                  {supplier && <span className="sip-cr-supplier">{supplier}</span>}
                  {item.yeniUrunData && <span className="sip-new-badge">NEW</span>}
                </div>
                <div className="sip-cr-fiyat">
                  {satirToplam != null
                    ? <>{satirToplam.toLocaleString()} <span className="sip-cr-doviz">{f.doviz || 'USD'}</span></>
                    : <span className="sip-cr-soru">?</span>
                  }
                </div>
                <button className="sip-cr-del" onClick={() => onSil(item.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            );
          })}
        </>
      )}

      {/* Inline yeni satır ekleme */}
      <div className="sip-new-row" ref={newRef}>
        <input
          type="number" min="1" max="99999" value={newAdet}
          onChange={e => setNewAdet(e.target.value)}
          className="sip-nr-adet" placeholder={t.adet_gir}
        />
        <div className="sip-nr-input-wrap">
          <input
            type="text" value={newKod}
            onChange={e => { setNewKod(e.target.value); setNewAcOpen(true); }}
            onFocus={() => newKod.length >= 2 && setNewAcOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter') newRowAdd(); }}
            placeholder={t.ekle_placeholder}
            className="sip-nr-input"
          />
          {newAcOpen && newAcResults.length > 0 && (
            <div className="sip-ac-dropdown sip-nr-dropdown">
              {newAcResults.map(u => (
                <div key={u.kod} className="sip-ac-item" onClick={() => newRowSelect(u)}>
                  <span>{u.kod} — {u.ad}</span>
                  <span className={`sip-ac-stock ${u.stokVar ? 'in' : 'out'}`}>
                    {u.stokVar ? t.stokta : t.stok_yok}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="sip-nr-add" onClick={newRowAdd} disabled={!newKod.trim()}>+</button>
      </div>

      {/* Toplam + Gönder */}
      {sepet.length > 0 && (
        <div className="sip-summary">
          <div className="sip-sum-row">
            <span className="sip-muted">{sepet.length} {t.satirlar}, {sepetOzet.topAdet} {t.topAdet}</span>
          </div>
          <div className="sip-sum-row">
            <span className="sip-muted">{t.fiyatli_toplam}</span>
            <span>{sepetOzet.fiyatliToplam.toLocaleString()} {sepetOzet.doviz}</span>
          </div>
          {sepetOzet.fiyatSorulacak > 0 && (
            <div className="sip-sum-row">
              <span className="sip-muted">{t.fiyat_sorun_kalem}</span>
              <span className="sip-warn">{sepetOzet.fiyatSorulacak} {t.satirlar}</span>
            </div>
          )}
          <div className="sip-sum-row sip-sum-total">
            <span>{t.toplam}</span>
            <span>{sepetOzet.fiyatliToplam.toLocaleString()} {sepetOzet.doviz}</span>
          </div>
          <button className="sip-send-btn" onClick={onGonder} disabled={busy}>
            {busy ? t.gonderiliyor : t.gonder}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Takip Tab ───────────────────────────────────────
function TakipTab({ t, siparisler, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil }) {
  const beklemede = siparisler.filter(s => s.durum === 'beklemede');
  const kismi = siparisler.filter(s => s.durum === 'kismi');
  const tamamlandi = siparisler.filter(s => s.durum === 'tamamlandi');
  const iptal = siparisler.filter(s => s.durum === 'iptal');

  if (siparisler.length === 0) {
    return <div className="sip-empty">{t.bos_siparis}</div>;
  }

  return (
    <div className="sip-takip-tab">
      {beklemede.length > 0 && (
        <SiparisGrupList label={t.beklemede} status="beklemede" items={beklemede} t={t} fiyatlar={fiyatlar} busy={busy} onGrupSil={onGrupSil} onKalemGuncelle={onKalemGuncelle} onKalemSil={onKalemSil} />
      )}
      {kismi.length > 0 && (
        <SiparisGrupList label={t.kismi} status="kismi" items={kismi} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
      {tamamlandi.length > 0 && (
        <SiparisGrupList label={t.tamamlandi} status="tamamlandi" items={tamamlandi} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
      {iptal.length > 0 && (
        <SiparisGrupList label={t.iptal_durum} status="iptal" items={iptal} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
    </div>
  );
}

function SiparisGrupList({ label, status, items, t, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil }) {
  return (
    <div className="sip-sgroup">
      <div className={`sip-sgroup-label status-${status}`}>{label} ({items.length})</div>
      {items.map(grup => (
        <SiparisGrupCard key={grup.id} grup={grup} t={t} fiyatlar={fiyatlar} busy={busy}
          onGrupSil={onGrupSil} onKalemGuncelle={onKalemGuncelle} onKalemSil={onKalemSil}
        />
      ))}
    </div>
  );
}

function SiparisGrupCard({ grup, t, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil }) {
  const [open, setOpen] = useState(false);
  const kalemler = grup.kalemler || [];
  const tarih = new Date(grup.tarih).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const topKalem = kalemler.length;
  const topAdet = kalemler.reduce((s, k) => s + k.adet, 0);
  const topKarsilanan = kalemler.reduce((s, k) => s + (k.karsilanan || 0), 0);
  const editable = grup.durum === 'beklemede' && topKarsilanan === 0;

  return (
    <div className={`sip-grup-card status-${grup.durum}`}>
      {/* Grup başlık — tıkla aç/kapat */}
      <div className="sip-gc-header" onClick={() => setOpen(o => !o)}>
        <div className="sip-gc-left">
          <span className="sip-gc-count">{topKalem} {t.satirlar}</span>
          <span className="sip-gc-adet">{topKarsilanan > 0 ? `${topKarsilanan}/` : ''}{topAdet} {t.topAdet}</span>
        </div>
        <div className="sip-gc-right">
          <span className="sip-gc-tarih">{tarih}</span>
          <span className={`sip-gc-chevron ${open ? 'open' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
      </div>

      {/* Kalem listesi — açılınca görünür */}
      {open && (
        <div className="sip-gc-kalemler">
          {kalemler.map(k => (
            <KalemRow key={k.id} k={k} grupId={grup.id} t={t} fiyat={fiyatlar[k.urunKod]}
              editable={editable} busy={busy} onGuncelle={onKalemGuncelle} onSil={onKalemSil}
            />
          ))}
          {/* Grup sil butonu */}
          {editable && onGrupSil && (
            <button className="sip-gc-del" onClick={() => onGrupSil(grup.id)} disabled={busy}>
              {t.sil}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KalemRow({ k, grupId, t, fiyat, editable, busy, onGuncelle, onSil }) {
  const [editMode, setEditMode] = useState(false);
  const [yeniAdet, setYeniAdet] = useState(String(k.adet));

  function handleSave() {
    const a = parseInt(yeniAdet);
    if (a && a !== k.adet && a >= 1) {
      onGuncelle?.(grupId, k.id, a);
    }
    setEditMode(false);
  }

  return (
    <div className="sip-kalem-row">
      <div className="sip-kr-info">
        <span className="sip-kr-name">{k.urunAd}</span>
        <span className="sip-kr-code">{k.urunKod}</span>
      </div>
      <div className="sip-kr-right">
        {k.karsilanan > 0 && <span className="sip-kr-karsi">{k.karsilanan}/</span>}
        <span className="sip-kr-adet">{k.adet}</span>
        {fiyat && <span className="sip-kr-fiyat">{fiyat.fiyat} {fiyat.doviz}</span>}
        {k.yeniUrun && <span className="sip-new-badge">NEW</span>}
      </div>
      {editable && onSil && !editMode && (
        <div className="sip-kr-actions">
          <button onClick={() => { setYeniAdet(String(k.adet)); setEditMode(true); }} disabled={busy} className="sip-kr-btn">{t.adet}</button>
          <button onClick={() => onSil(grupId, k.id)} disabled={busy} className="sip-kr-btn del">{t.sil}</button>
        </div>
      )}
      {editMode && (
        <div className="sip-kr-edit">
          <input type="number" min="1" max="99999" value={yeniAdet}
            onChange={e => setYeniAdet(e.target.value)} className="sip-kr-edit-input"
            style={{ fontSize: 16 }} />
          <button onClick={handleSave} disabled={busy} className="sip-kr-btn">{t.guncelle}</button>
          <button onClick={() => setEditMode(false)} className="sip-kr-btn">{t.iptal_btn}</button>
        </div>
      )}
    </div>
  );
}

// ── Hesabım Tab (placeholder) ───────────────────────
function HesabimTab({ t }) {
  return (
    <div className="sip-hesabim-tab">
      <div className="sip-empty">{t.hesabim_yakin}</div>
    </div>
  );
}

// ── Theme Toggle ────────────────────────────────────
function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button className="sip-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
      )}
    </button>
  );
}

// ── Lang Toggle ─────────────────────────────────────
function LangToggle({ lang, setLang }) {
  return (
    <button className="sip-lang-toggle" onClick={() => setLang(l => l === 'tr' ? 'en' : 'tr')}>
      {lang === 'tr' ? 'EN' : 'TR'}
    </button>
  );
}
