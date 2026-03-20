import { useState, useEffect, useMemo, useRef } from 'react';

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

// ── Dil ─────────────────────────────────────────────
const LANG = {
  tr: {
    pin_title: 'Bekilli Group',
    pin_sub: 'Sipariş Sistemi',
    pin_placeholder: '6 haneli PIN giriniz',
    pin_btn: 'Giriş',
    pin_error: 'Geçersiz PIN',
    katalog: 'Katalog',
    siparislerim: 'Siparişlerim',
    ara: 'Ürün ara...',
    tumu: 'Tümü',
    stokta: 'Stokta',
    stok_yok: 'Stokta yok',
    fiyat_sorun: 'Fiyat sorulacak',
    adet: 'Adet',
    not_placeholder: 'Not (isteğe bağlı)',
    ekle: 'Siparişe Ekle',
    eklendi: 'Eklendi!',
    beklemede: 'Beklemede',
    kismi: 'Kısmi',
    tamamlandi: 'Tamamlandı',
    iptal: 'İptal',
    sil: 'Sil',
    bos_siparis: 'Henüz sipariş yok',
    bos_katalog: 'Katalog boş',
    karsilanan: 'karşılandı',
    yukleniyor: 'Yükleniyor...',
    cikis: 'Çıkış',
    yeni_urun: 'Katalogda yok mu?',
    yeni_urun_title: 'Yeni Ürün Talebi',
    parca_no: 'Parça No',
    supplier: 'Üretici',
    urun_ad: 'Ürün Adı',
    kategori: 'Kategori',
    iptal_btn: 'İptal',
    gonder: 'Gönder',
    hata: 'Hata',
    tekrar: 'Tekrar dene',
    baglanamadi: 'Sunucuya bağlanılamadı',
    siparis_ozet: 'sipariş',
    guncelle: 'Güncelle',
    adet_gir: 'Yeni adet',
  },
  en: {
    pin_title: 'Bekilli Group',
    pin_sub: 'Order System',
    pin_placeholder: 'Enter 6-digit PIN',
    pin_btn: 'Login',
    pin_error: 'Invalid PIN',
    katalog: 'Catalog',
    siparislerim: 'My Orders',
    ara: 'Search products...',
    tumu: 'All',
    stokta: 'In Stock',
    stok_yok: 'Out of Stock',
    fiyat_sorun: 'Price on request',
    adet: 'Qty',
    not_placeholder: 'Note (optional)',
    ekle: 'Add to Order',
    eklendi: 'Added!',
    beklemede: 'Pending',
    kismi: 'Partial',
    tamamlandi: 'Completed',
    iptal: 'Cancelled',
    sil: 'Remove',
    bos_siparis: 'No orders yet',
    bos_katalog: 'Catalog is empty',
    karsilanan: 'fulfilled',
    yukleniyor: 'Loading...',
    cikis: 'Logout',
    yeni_urun: 'Not in catalog?',
    yeni_urun_title: 'New Product Request',
    parca_no: 'Part No',
    supplier: 'Manufacturer',
    urun_ad: 'Product Name',
    kategori: 'Category',
    iptal_btn: 'Cancel',
    gonder: 'Submit',
    hata: 'Error',
    tekrar: 'Try again',
    baglanamadi: 'Cannot connect to server',
    siparis_ozet: 'order(s)',
    guncelle: 'Update',
    adet_gir: 'New qty',
  },
};

const SUPPLIERS = ['AMBAC', 'Delphi', 'Bosch', 'Denso', 'OEM', 'CAT', 'Stanadyne'];
const KATEGORILER = ['Nozzle', 'Injector', 'Plunger', 'Element', 'Pump', 'Valve', 'Gasket'];

// ── App ─────────────────────────────────────────────
export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('sip_lang') || 'tr');
  const [pin, setPin] = useState(() => sessionStorage.getItem('sip_pin') || '');
  const [musteri, setMusteri] = useState(null);
  const [katalog, setKatalog] = useState([]);
  const [fiyatlar, setFiyatlar] = useState({});
  const [siparisler, setSiparisler] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const t = LANG[lang];

  // Cold start ön ısıtma
  useEffect(() => { fetch(API).catch(() => {}); }, []);

  // Dil kaydet
  useEffect(() => { localStorage.setItem('sip_lang', lang); }, [lang]);

  // Otomatik giriş (sessionStorage'da PIN varsa)
  useEffect(() => {
    if (pin && !loggedIn) doLogin(pin);
  }, []); // eslint-disable-line

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
      setFiyatlar(userData.fiyatlar || {});
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
    setPin('');
    setMusteri(null);
    setLoggedIn(false);
    setSiparisler([]);
    setFiyatlar({});
    setKatalog([]);
  }

  // Sipariş verilerini yenile
  async function refreshSiparisler() {
    try {
      const data = await apiCall(API, pin);
      setSiparisler(data.siparisler || []);
    } catch (err) { console.warn('Sipariş yenileme hatası:', err.message); }
  }

  if (!loggedIn) {
    return <LoginScreen t={t} lang={lang} setLang={setLang} loading={loading} error={error} onLogin={doLogin} />;
  }

  return (
    <MainApp
      t={t} lang={lang} setLang={setLang} pin={pin}
      musteri={musteri} katalog={katalog} fiyatlar={fiyatlar}
      siparisler={siparisler} refreshSiparisler={refreshSiparisler}
      onLogout={doLogout}
    />
  );
}

// ── Login ───────────────────────────────────────────
function LoginScreen({ t, lang, setLang, loading, error, onLogin }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (input.length === 6) onLogin(input);
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <LangToggle lang={lang} setLang={setLang} />
        <div className="login-icon">📦</div>
        <h1 className="login-title">{t.pin_title}</h1>
        <p className="login-sub">{t.pin_sub}</p>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={input}
            onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
            placeholder={t.pin_placeholder}
            className="pin-input"
            autoComplete="off"
          />
          <button type="submit" disabled={input.length !== 6 || loading} className="pin-btn">
            {loading ? t.yukleniyor : t.pin_btn}
          </button>
        </form>

        {error && <p className="login-error">{t.pin_error}</p>}
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────
function MainApp({ t, lang, setLang, pin, musteri, katalog, fiyatlar, siparisler, refreshSiparisler, onLogout }) {
  const [tab, setTab] = useState('katalog');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  async function siparisEkle(urunKod, urunAd, adet, not, yeniUrunData) {
    setBusy(true);
    try {
      const body = { islem: 'ekle', urunKod, urunAd, adet: parseInt(adet), not };
      if (yeniUrunData) {
        body.yeniUrun = true;
        body.parcaNo = yeniUrunData.parcaNo;
        body.supplier = yeniUrunData.supplier;
        body.kategori = yeniUrunData.kategori;
      }
      await apiCall(API, pin, body);
      await refreshSiparisler();
      showToast(t.eklendi);
    } catch (err) {
      showToast(t.hata + ': ' + err.message);
    }
    setBusy(false);
  }

  async function siparisSil(siparisId) {
    setBusy(true);
    try {
      await apiCall(API, pin, { islem: 'sil', siparisId });
      await refreshSiparisler();
    } catch (err) {
      showToast(t.hata + ': ' + err.message);
    }
    setBusy(false);
  }

  async function siparisGuncelle(siparisId, adet) {
    setBusy(true);
    try {
      await apiCall(API, pin, { islem: 'guncelle', siparisId, adet: parseInt(adet) });
      await refreshSiparisler();
    } catch (err) {
      showToast(t.hata + ': ' + err.message);
    }
    setBusy(false);
  }

  const bekleyenSayisi = siparisler.filter(s => s.durum === 'beklemede' || s.durum === 'kismi').length;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <span className="header-icon">📦</span>
          <div>
            <div className="header-title">Bekilli Group</div>
            <div className="header-customer">{musteri.ad}</div>
          </div>
        </div>
        <div className="header-right">
          <LangToggle lang={lang} setLang={setLang} />
          <button onClick={onLogout} className="logout-btn">{t.cikis}</button>
        </div>
      </header>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'katalog' ? 'active' : ''}`} onClick={() => setTab('katalog')}>
          {t.katalog}
        </button>
        <button className={`tab-btn ${tab === 'siparislerim' ? 'active' : ''}`} onClick={() => setTab('siparislerim')}>
          {t.siparislerim}
          {bekleyenSayisi > 0 && <span className="tab-badge">{bekleyenSayisi}</span>}
        </button>
      </div>

      {/* Content */}
      <div className="app-content">
        {tab === 'katalog' && (
          <KatalogTab t={t} katalog={katalog} fiyatlar={fiyatlar} busy={busy} onSiparisEkle={siparisEkle} />
        )}
        {tab === 'siparislerim' && (
          <SiparislerimTab t={t} siparisler={siparisler} fiyatlar={fiyatlar} busy={busy}
            onSil={siparisSil} onGuncelle={siparisGuncelle} />
        )}
      </div>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ── Katalog Tab ─────────────────────────────────────
function KatalogTab({ t, katalog, fiyatlar, busy, onSiparisEkle }) {
  const [search, setSearch] = useState('');
  const [katFilter, setKatFilter] = useState('');
  const [yeniUrunOpen, setYeniUrunOpen] = useState(false);

  const kategoriler = useMemo(() => {
    const set = new Set(katalog.map(u => u.kategori).filter(Boolean));
    return [...set].sort();
  }, [katalog]);

  const filtered = useMemo(() => {
    let list = katalog;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(u => u.ad?.toLowerCase().includes(s) || u.kod?.toLowerCase().includes(s) || u.marka?.toLowerCase().includes(s));
    }
    if (katFilter) list = list.filter(u => u.kategori === katFilter);
    return list;
  }, [katalog, search, katFilter]);

  return (
    <div className="katalog-tab">
      {/* Search + Filter */}
      <div className="search-bar">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t.ara} className="search-input"
        />
        <select value={katFilter} onChange={e => setKatFilter(e.target.value)} className="filter-select">
          <option value="">{t.tumu}</option>
          {kategoriler.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {/* Product List */}
      {filtered.length === 0 ? (
        <div className="empty-state">{t.bos_katalog}</div>
      ) : (
        <div className="product-list">
          {filtered.map(urun => (
            <ProductCard key={urun.kod} urun={urun} fiyat={fiyatlar[urun.kod]} t={t} busy={busy} onEkle={onSiparisEkle} />
          ))}
        </div>
      )}

      {/* Yeni Ürün */}
      <button className="yeni-urun-btn" onClick={() => setYeniUrunOpen(v => !v)}>
        {yeniUrunOpen ? t.iptal_btn : t.yeni_urun}
      </button>
      {yeniUrunOpen && (
        <YeniUrunForm t={t} busy={busy} onEkle={onSiparisEkle} onClose={() => setYeniUrunOpen(false)} />
      )}
    </div>
  );
}

// ── Product Card ────────────────────────────────────
function ProductCard({ urun, fiyat, t, busy, onEkle }) {
  const [open, setOpen] = useState(false);
  const [adet, setAdet] = useState('1');
  const [not, setNot] = useState('');

  function handleEkle() {
    if (!adet || parseInt(adet) < 1) return;
    onEkle(urun.kod, urun.ad, adet, not);
    setOpen(false);
    setAdet('1');
    setNot('');
  }

  return (
    <div className="product-card">
      <div className="product-main" onClick={() => setOpen(v => !v)}>
        <div className="product-info">
          <div className="product-name">{urun.ad}</div>
          <div className="product-meta">
            <span className="product-code">{urun.kod}</span>
            <span className="product-brand">{urun.marka}</span>
          </div>
        </div>
        <div className="product-right">
          {fiyat ? (
            <div className="product-price">{fiyat.fiyat} {fiyat.doviz}</div>
          ) : (
            <div className="product-price no-price">{t.fiyat_sorun}</div>
          )}
          <span className={`stock-badge ${urun.stokVar ? 'in-stock' : 'no-stock'}`}>
            {urun.stokVar ? t.stokta : t.stok_yok}
          </span>
        </div>
      </div>

      {open && (
        <div className="product-order-form">
          <div className="order-row">
            <input
              type="number" min="1" max="99999" value={adet}
              onChange={e => setAdet(e.target.value)}
              className="adet-input" placeholder={t.adet}
            />
            <input
              type="text" value={not} onChange={e => setNot(e.target.value)}
              className="not-input" placeholder={t.not_placeholder} maxLength={500}
            />
            <button onClick={handleEkle} disabled={busy || !adet} className="ekle-btn">
              {t.ekle}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Yeni Ürün Formu ─────────────────────────────────
function YeniUrunForm({ t, busy, onEkle, onClose }) {
  const [parcaNo, setParcaNo] = useState('');
  const [supplier, setSupplier] = useState('');
  const [urunAd, setUrunAd] = useState('');
  const [kategori, setKategori] = useState('');
  const [adet, setAdet] = useState('1');
  const [not, setNot] = useState('');

  const kod = parcaNo && supplier ? `${parcaNo}-${supplier}`.toUpperCase() : '';

  function handleGonder() {
    if (!parcaNo || !supplier || !adet) return;
    onEkle(kod, urunAd || kod, adet, not, { parcaNo, supplier, kategori });
    onClose();
  }

  return (
    <div className="yeni-urun-form">
      <h3 className="form-title">{t.yeni_urun_title}</h3>
      <div className="form-grid">
        <div className="form-field">
          <label>{t.parca_no} *</label>
          <input type="text" value={parcaNo} onChange={e => setParcaNo(e.target.value)} maxLength={50} />
        </div>
        <div className="form-field">
          <label>{t.supplier} *</label>
          <select value={supplier} onChange={e => setSupplier(e.target.value)}>
            <option value="">---</option>
            {SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>{t.urun_ad}</label>
          <input type="text" value={urunAd} onChange={e => setUrunAd(e.target.value)} maxLength={200} />
        </div>
        <div className="form-field">
          <label>{t.kategori}</label>
          <select value={kategori} onChange={e => setKategori(e.target.value)}>
            <option value="">---</option>
            {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>{t.adet} *</label>
          <input type="number" min="1" max="99999" value={adet} onChange={e => setAdet(e.target.value)} />
        </div>
        <div className="form-field full-width">
          <label>{t.not_placeholder}</label>
          <input type="text" value={not} onChange={e => setNot(e.target.value)} maxLength={500} />
        </div>
      </div>
      {kod && <div className="kod-preview">{t.parca_no}: <strong>{kod}</strong></div>}
      <div className="form-actions">
        <button onClick={onClose} className="cancel-btn">{t.iptal_btn}</button>
        <button onClick={handleGonder} disabled={busy || !parcaNo || !supplier || !adet} className="submit-btn">
          {t.gonder}
        </button>
      </div>
    </div>
  );
}

// ── Siparişlerim Tab ────────────────────────────────
function SiparislerimTab({ t, siparisler, fiyatlar, busy, onSil, onGuncelle }) {
  const beklemede = siparisler.filter(s => s.durum === 'beklemede');
  const kismi = siparisler.filter(s => s.durum === 'kismi');
  const tamamlandi = siparisler.filter(s => s.durum === 'tamamlandi');
  const iptal = siparisler.filter(s => s.durum === 'iptal');

  if (siparisler.length === 0) {
    return <div className="empty-state">{t.bos_siparis}</div>;
  }

  return (
    <div className="siparisler-tab">
      <div className="siparis-ozet">
        {beklemede.length + kismi.length} {t.beklemede} · {tamamlandi.length} {t.tamamlandi}
      </div>

      {beklemede.length > 0 && (
        <SiparisGroup title={t.beklemede} siparisler={beklemede} t={t} fiyatlar={fiyatlar} busy={busy} onSil={onSil} onGuncelle={onGuncelle} status="beklemede" />
      )}
      {kismi.length > 0 && (
        <SiparisGroup title={t.kismi} siparisler={kismi} t={t} fiyatlar={fiyatlar} busy={busy} status="kismi" />
      )}
      {tamamlandi.length > 0 && (
        <SiparisGroup title={t.tamamlandi} siparisler={tamamlandi} t={t} fiyatlar={fiyatlar} busy={busy} status="tamamlandi" />
      )}
      {iptal.length > 0 && (
        <SiparisGroup title={t.iptal} siparisler={iptal} t={t} fiyatlar={fiyatlar} busy={busy} status="iptal" />
      )}
    </div>
  );
}

function SiparisGroup({ title, siparisler, t, fiyatlar, busy, onSil, onGuncelle, status }) {
  return (
    <div className="siparis-group">
      <h3 className={`group-title status-${status}`}>{title} ({siparisler.length})</h3>
      {siparisler.map(s => (
        <SiparisCard key={s.id} siparis={s} t={t} fiyat={fiyatlar[s.urunKod]} busy={busy} onSil={onSil} onGuncelle={onGuncelle} />
      ))}
    </div>
  );
}

function SiparisCard({ siparis, t, fiyat, busy, onSil, onGuncelle }) {
  const [editAdet, setEditAdet] = useState(false);
  const [yeniAdet, setYeniAdet] = useState(String(siparis.adet));
  const s = siparis;

  function handleGuncelle() {
    if (parseInt(yeniAdet) !== s.adet && parseInt(yeniAdet) >= 1) {
      onGuncelle?.(s.id, yeniAdet);
    }
    setEditAdet(false);
  }

  const tarih = new Date(s.tarih).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className={`siparis-card status-${s.durum}`}>
      <div className="siparis-top">
        <div className="siparis-info">
          <div className="siparis-name">{s.urunAd}</div>
          <div className="siparis-code">{s.urunKod}</div>
          {s.yeniUrun && <span className="new-badge">NEW</span>}
        </div>
        <div className="siparis-right">
          <span className="siparis-tarih">{tarih}</span>
          {fiyat && <span className="siparis-fiyat">{fiyat.fiyat} {fiyat.doviz}</span>}
        </div>
      </div>

      <div className="siparis-bottom">
        <div className="siparis-adet">
          {s.karsilanan > 0 && <span className="karsilanan">{s.karsilanan}/</span>}
          <span>{s.adet} {t.adet}</span>
          {s.karsilanan > 0 && <span className="karsilanan-label"> ({s.karsilanan} {t.karsilanan})</span>}
        </div>
        {s.not && <div className="siparis-not">{s.not}</div>}

        {/* Düzenle/Sil butonları — sadece beklemede siparişler */}
        {s.durum === 'beklemede' && s.karsilanan === 0 && (
          <div className="siparis-actions">
            {editAdet ? (
              <div className="edit-adet">
                <input type="number" min="1" max="99999" value={yeniAdet}
                  onChange={e => setYeniAdet(e.target.value)} className="adet-edit-input" />
                <button onClick={handleGuncelle} disabled={busy} className="update-btn">{t.guncelle}</button>
                <button onClick={() => setEditAdet(false)} className="cancel-sm">{t.iptal_btn}</button>
              </div>
            ) : (
              <>
                <button onClick={() => { setYeniAdet(String(s.adet)); setEditAdet(true); }} className="edit-btn" disabled={busy}>
                  {t.adet}
                </button>
                <button onClick={() => onSil?.(s.id)} className="sil-btn" disabled={busy}>{t.sil}</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lang Toggle ─────────────────────────────────────
function LangToggle({ lang, setLang }) {
  return (
    <button className="lang-toggle" onClick={() => setLang(l => l === 'tr' ? 'en' : 'tr')}>
      {lang === 'tr' ? 'EN' : 'TR'}
    </button>
  );
}
