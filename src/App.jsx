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

const SUPPLIERS = ['AMBAC', 'Delphi', 'Bosch', 'Denso', 'OEM', 'CAT', 'Stanadyne'];
const KATEGORILER = ['Nozzle', 'Injector', 'Plunger', 'Element', 'Pump', 'Valve', 'Gasket'];

// ── App ─────────────────────────────────────────────
export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('sip_lang') || 'tr');
  const [theme, setTheme] = useState(() => localStorage.getItem('sip_theme') || 'light');
  const [pin, setPin] = useState(() => sessionStorage.getItem('sip_pin') || '');
  const [musteri, setMusteri] = useState(null);
  const [katalog, setKatalog] = useState([]);
  const [fiyatlar, setFiyatlar] = useState({});
  const [siparisler, setSiparisler] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const t = LANG[lang];
  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  useEffect(() => { fetch(API).catch(() => {}); }, []);
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

  // ── Sipariş gönder (tüm sepet) ──────────────────
  async function siparisGonder() {
    if (sepet.length === 0 || busy) return;
    setBusy(true);
    let basarili = 0;
    for (const item of sepet) {
      try {
        const body = { islem: 'ekle', urunKod: item.urunKod, urunAd: item.urunAd, adet: item.adet, not: item.not || '' };
        if (item.yeniUrunData) {
          body.yeniUrun = true;
          body.parcaNo = item.yeniUrunData.parcaNo;
          body.supplier = item.yeniUrunData.supplier;
          body.kategori = item.yeniUrunData.kategori;
        }
        await apiCall(API, pin, body);
        basarili++;
      } catch (err) { console.warn('Sipariş gönderme hatası:', err.message); }
    }
    await refreshSiparisler();
    setSepet([]);
    showToast(`${basarili} ${t.gonderildi}`);
    setBusy(false);
    setTab('takip');
  }

  // ── Takip: sipariş sil ──────────────────────────
  async function siparisSil(siparisId) {
    setBusy(true);
    try {
      await apiCall(API, pin, { islem: 'sil', siparisId });
      await refreshSiparisler();
    } catch (err) { showToast(t.hata + ': ' + err.message); }
    setBusy(false);
  }

  // ── Takip: sipariş güncelle ─────────────────────
  async function siparisGuncelle(siparisId, adet) {
    setBusy(true);
    try {
      await apiCall(API, pin, { islem: 'guncelle', siparisId, adet: parseInt(adet) });
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
      const key = u.supplier || 'Diğer';
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
        {/* SOL: Filtreler (ince) */}
        <aside className="sip-left">
          <FilterSection title={t.kategori} items={kategoriler} value={katFilter} onChange={setKatFilter} allLabel={t.tumu} />
          <FilterSection title={t.marka} items={markalar} value={markaFilter} onChange={setMarkaFilter} allLabel={t.tumu} />
          <FilterSection title={t.supplier} items={suppliers} value={supplierFilter} onChange={setSupplierFilter} allLabel={t.tumu} />
        </aside>

        {/* ORTA: Katalog (ince) */}
        <div className="sip-mid">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t.ara} className="sip-search"
          />
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

        {/* SAĞ: Sipariş paneli (geniş) */}
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
                busy={busy} onSil={siparisSil} onGuncelle={siparisGuncelle}
              />
            )}
            {tab === 'hesabim' && <HesabimTab t={t} />}
          </div>
        </div>
      </div>

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
            <span className="sip-ch-adet">{t.adet}</span>
            <span className="sip-ch-urun">{t.urun}</span>
            <span className="sip-ch-birim">{t.birim}</span>
            <span className="sip-ch-toplam">{t.toplam}</span>
            <span className="sip-ch-del"></span>
          </div>
          {sepet.map(item => {
            const f = fiyatlar[item.urunKod];
            const satirToplam = f?.fiyat ? item.adet * f.fiyat : null;
            return (
              <div key={item.id} className="sip-cart-row">
                <input
                  type="number" min="1" max="99999" value={item.adet}
                  onChange={e => onAdetGuncelle(item.id, e.target.value)}
                  className="sip-cr-adet"
                />
                <div className="sip-cr-urun">
                  <div className="sip-cr-name">{item.urunAd}</div>
                  {item.urunKod !== item.urunAd && <div className="sip-cr-code">{item.urunKod}</div>}
                  {item.yeniUrunData && <span className="sip-new-badge">NEW</span>}
                </div>
                <div className="sip-cr-birim">
                  {f?.fiyat ? `${f.fiyat} ${f.doviz || 'USD'}` : <span className="sip-muted">{t.fiyat_sorun}</span>}
                </div>
                <div className="sip-cr-toplam">
                  {satirToplam != null ? `${satirToplam.toLocaleString()} ${f.doviz || 'USD'}` : '—'}
                </div>
                <button className="sip-cr-del" onClick={() => onSil(item.id)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
function TakipTab({ t, siparisler, fiyatlar, busy, onSil, onGuncelle }) {
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
        <SiparisGroup label={t.beklemede} status="beklemede" items={beklemede} t={t} fiyatlar={fiyatlar} busy={busy} onSil={onSil} onGuncelle={onGuncelle} />
      )}
      {kismi.length > 0 && (
        <SiparisGroup label={t.kismi} status="kismi" items={kismi} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
      {tamamlandi.length > 0 && (
        <SiparisGroup label={t.tamamlandi} status="tamamlandi" items={tamamlandi} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
      {iptal.length > 0 && (
        <SiparisGroup label={t.iptal_durum} status="iptal" items={iptal} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
    </div>
  );
}

function SiparisGroup({ label, status, items, t, fiyatlar, busy, onSil, onGuncelle }) {
  return (
    <div className="sip-sgroup">
      <div className={`sip-sgroup-label status-${status}`}>{label} ({items.length})</div>
      {items.map(s => (
        <SiparisCard key={s.id} s={s} t={t} fiyat={fiyatlar[s.urunKod]} busy={busy} onSil={onSil} onGuncelle={onGuncelle} />
      ))}
    </div>
  );
}

function SiparisCard({ s, t, fiyat, busy, onSil, onGuncelle }) {
  const [editMode, setEditMode] = useState(false);
  const [yeniAdet, setYeniAdet] = useState(String(s.adet));
  const tarih = new Date(s.tarih).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  function handleGuncelle() {
    if (parseInt(yeniAdet) !== s.adet && parseInt(yeniAdet) >= 1) {
      onGuncelle?.(s.id, yeniAdet);
    }
    setEditMode(false);
  }

  return (
    <div className={`sip-scard status-${s.durum}`}>
      <div className="sip-sc-top">
        <div className="sip-sc-info">
          <div className="sip-sc-name">{s.urunAd}</div>
          <div className="sip-sc-code">{s.urunKod}</div>
        </div>
        <div className="sip-sc-right">
          <span className="sip-sc-tarih">{tarih}</span>
          {fiyat && <span className="sip-sc-fiyat">{fiyat.fiyat} {fiyat.doviz}</span>}
        </div>
      </div>
      <div className="sip-sc-bottom">
        <span className="sip-sc-adet">
          {s.karsilanan > 0 && <span className="sip-karsilanan">{s.karsilanan}/</span>}
          {s.adet} {t.adet}
          {s.karsilanan > 0 && <span className="sip-muted"> ({s.karsilanan} {t.karsilanan})</span>}
        </span>
        {s.not && <div className="sip-sc-not">{s.not}</div>}
        {s.yeniUrun && <span className="sip-new-badge">NEW</span>}
      </div>
      {s.durum === 'beklemede' && s.karsilanan === 0 && onSil && (
        <div className="sip-sc-actions">
          {editMode ? (
            <div className="sip-sc-edit">
              <input type="number" min="1" max="99999" value={yeniAdet}
                onChange={e => setYeniAdet(e.target.value)} className="sip-sc-edit-input" />
              <button onClick={handleGuncelle} disabled={busy} className="sip-sc-edit-save">{t.guncelle}</button>
              <button onClick={() => setEditMode(false)} className="sip-sc-edit-cancel">{t.iptal_btn}</button>
            </div>
          ) : (
            <>
              <button onClick={() => { setYeniAdet(String(s.adet)); setEditMode(true); }} disabled={busy} className="sip-sc-btn edit">{t.adet}</button>
              <button onClick={() => onSil(s.id)} disabled={busy} className="sip-sc-btn del">{t.sil}</button>
            </>
          )}
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
