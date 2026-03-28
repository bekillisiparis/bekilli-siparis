// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal v4 App Shell
// 2 sayfa: Sipariş (3 panel) + Hesabım (2 panel)
// İş mantığı sayfalarda, burada sadece auth + routing + topnav
// ══════════════════════════════════════════════════════════════════════
import { useState, useReducer, useEffect, useRef, useCallback } from 'react';
import SiparisPage from './SiparisPage';
import HesabimPage from './HesabimPage';

// ── API ─────────────────────────────────────────────
const API = '/api/siparis';
const BEKILLI_LOGO = "data:image/png;base64,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";
const BEKILLI_LOGO_NAV = "data:image/png;base64,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";

// ── API Helper ──────────────────────────────────────
async function apiCall(url, pin, body) {
  const opts = { headers: {} };
  if (pin) opts.headers['X-Siparis-PIN'] = pin;
  if (body) {
    opts.method = 'POST';
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.hata || `HTTP ${res.status}`);
  }
  return res.json();
}

function extractFiyatlar(raw) {
  if (!raw || typeof raw !== 'object') return {};
  // API döner: { guncelleme, fiyatlar: { "KOD": {fiyat,doviz} }, oncekiFiyatlar }
  // Nested format ise iç fiyatlar objesini kullan
  const source = (raw.fiyatlar && typeof raw.fiyatlar === 'object' && !raw.fiyat) ? raw.fiyatlar : raw;
  const out = {};
  for (const [kod, val] of Object.entries(source)) {
    if (val && typeof val === 'object') out[kod] = val;
    else if (typeof val === 'number') out[kod] = { fiyat: val, doviz: 'USD' };
  }
  return out;
}

// ── Dil ─────────────────────────────────────────────
const LANG = {
  tr: {
    siparis: 'Sipariş', hesabim: 'Hesabım', cikis: 'Çıkış', yenile: 'Yenile', portal: 'Sipariş Portalı',
    pin_sub: 'Sipariş portalına giriş yapın', pin_placeholder: '6 haneli PIN', pin_btn: 'Giriş',
    pin_error: 'Geçersiz PIN veya bağlantı hatası', yukleniyor: 'Giriş yapılıyor...',
    oturumu_ac: 'Oturumu açık tut', oto_cikis: '15 dk hareketsizlikte otomatik çıkış',
    // SiparisPage
    katalog: 'Katalog', ara: 'Ürün ara...', tumu: 'Tümü', kategori: 'Kategori', marka: 'OEM Marka', supplier: 'Üretici',
    stokta: 'Stokta', stok_yok: 'Yok', bos_katalog: 'Katalogda ürün yok',
    ekle_placeholder: 'Ürün kodu veya adı yazın...', adet: 'Adet', adet_gir: '#',
    urun: 'Ürün', toplam: 'Toplam', sepet_bos: 'Sepet boş',
    satirlar: 'satır', topAdet: 'adet', fiyatli_toplam: 'Fiyatlı toplam', fiyat_sorun_kalem: 'Fiyat sorulacak',
    gonder: 'Sipariş Gönder', gonderiliyor: 'Gönderiliyor...', gonderildi: 'gönderildi',
    hata: 'Hata', iptal_btn: 'İptal', guncelle: 'Güncelle', sil: 'Sil',
    not_placeholder: 'Not ekle (opsiyonel)...',
    // Takip
    takip: 'Takip', bos_siparis: 'Henüz sipariş yok',
    beklemede: 'Beklemede', hazirlaniyor: 'Hazırlanıyor', kismi: 'Kısmi', tamamlandi: 'Tamamlandı', iptal_durum: 'İptal',
    // HesabimPage
    bakiye: 'Bakiye', borc_durumu: 'Borçlu', alacak_durumu: 'Alacaklı',
    toplam_borc: 'Borç', toplam_alacak: 'Alacak',
    acik_fatura: 'Açık Faturalar', fatura_kisa: 'fatura', fatura_yok: 'Açık fatura yok',
    odenen: 'Ödenen', gun: 'gün',
    iade_alacak: 'İade Alacakları', iade_kisa: 'iade', iade: 'İade',
    bildirimler: 'Bildirimler', odemeler: 'Ödemeler', sik_alinanlar: 'Sık Alınanlar',
    bildirim_yok: 'Bildirim yok', odeme_yok: 'Ödeme geçmişi yok',
    tumunu_oku: 'Tümünü okundu yap', hesap_bos: 'Hesap bilgisi henüz oluşturulmadı.',
  },
  en: {
    siparis: 'Order', hesabim: 'Account', cikis: 'Logout', yenile: 'Refresh', portal: 'Order Portal',
    pin_sub: 'Login to order portal', pin_placeholder: '6-digit PIN', pin_btn: 'Login',
    pin_error: 'Invalid PIN or connection error', yukleniyor: 'Logging in...',
    oturumu_ac: 'Keep me signed in', oto_cikis: 'Auto-logout after 15 min of inactivity',
    katalog: 'Catalog', ara: 'Search products...', tumu: 'All', kategori: 'Category', marka: 'OEM Brand', supplier: 'Manufacturer',
    stokta: 'In stock', stok_yok: 'Out', bos_katalog: 'No products in catalog',
    ekle_placeholder: 'Type product code or name...', adet: 'Qty', adet_gir: '#',
    urun: 'Product', toplam: 'Total', sepet_bos: 'Cart is empty',
    satirlar: 'items', topAdet: 'pcs', fiyatli_toplam: 'Priced total', fiyat_sorun_kalem: 'Price pending',
    gonder: 'Send Order', gonderiliyor: 'Sending...', gonderildi: 'sent',
    hata: 'Error', iptal_btn: 'Cancel', guncelle: 'Update', sil: 'Delete',
    not_placeholder: 'Add note (optional)...',
    takip: 'Tracking', bos_siparis: 'No orders yet',
    beklemede: 'Pending', hazirlaniyor: 'Preparing', kismi: 'Partial', tamamlandi: 'Completed', iptal_durum: 'Cancelled',
    bakiye: 'Balance', borc_durumu: 'Debtor', alacak_durumu: 'Creditor',
    toplam_borc: 'Debt', toplam_alacak: 'Credit',
    acik_fatura: 'Open Invoices', fatura_kisa: 'invoices', fatura_yok: 'No open invoices',
    odenen: 'Paid', gun: 'days',
    iade_alacak: 'Return Credits', iade_kisa: 'returns', iade: 'Return',
    bildirimler: 'Notifications', odemeler: 'Payments', sik_alinanlar: 'Frequently Ordered',
    bildirim_yok: 'No notifications', odeme_yok: 'No payment history',
    tumunu_oku: 'Mark all read', hesap_bos: 'Account info not available yet.',
  },
};

// ── App Reducer ─────────────────────────────────────
const appInitial = {
  lang: localStorage.getItem('sip_lang') || 'tr',
  theme: localStorage.getItem('sip_theme') || 'light',
  pin: sessionStorage.getItem('sip_pin') || '',
  musteri: null, katalog: [], apiSuppliers: [], apiKategoriler: [],
  fiyatlar: {}, siparisler: [], hesap: null, sonYenileme: null,
  loading: false, error: '',
  loggedIn: false,
  keepSession: localStorage.getItem('sip_keep_session') === '1',
};
function appReducer(st, a) {
  switch (a.type) {
    case "LOGIN_START": return { ...st, loading: true, error: '' };
    case "LOGIN_OK": return { ...st, loading: false, loggedIn: true, pin: a.pin, musteri: a.musteri, siparisler: a.siparisler, hesap: a.hesap || null, sonYenileme: new Date(), fiyatlar: a.fiyatlar, katalog: a.katalog, apiSuppliers: a.apiSuppliers, apiKategoriler: a.apiKategoriler };
    case "LOGIN_FAIL": return { ...st, loading: false, error: a.error };
    case "LOGOUT": return { ...st, pin: '', musteri: null, loggedIn: false, siparisler: [], hesap: null, fiyatlar: {}, katalog: [], apiSuppliers: [], apiKategoriler: [] };
    case "REFRESH_OK": return { ...st, siparisler: a.siparisler, hesap: a.hesap !== undefined ? a.hesap : st.hesap, sonYenileme: new Date(), ...(a.katalog ? { katalog: a.katalog } : {}), ...(a.fiyatlar !== undefined ? { fiyatlar: a.fiyatlar } : {}), ...(a.apiSuppliers ? { apiSuppliers: a.apiSuppliers } : {}), ...(a.apiKategoriler ? { apiKategoriler: a.apiKategoriler } : {}) };
    case "SET_LANG": return { ...st, lang: a.v };
    case "SET_THEME": return { ...st, theme: st.theme === 'dark' ? 'light' : 'dark' };
    case "SET_KEEP_SESSION": return { ...st, keepSession: a.v };
    default: return st;
  }
}

// ── Icons ───────────────────────────────────────────
const OrderIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>;
const AccountIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;

// ── App ─────────────────────────────────────────────
export default function App() {
  const [s, dispatch] = useReducer(appReducer, appInitial);
  const { lang, theme, pin, musteri, katalog, apiSuppliers, apiKategoriler, fiyatlar, siparisler, hesap, sonYenileme, loading, error, loggedIn, keepSession } = s;

  const t = LANG[lang];
  const toggleTheme = useCallback(() => dispatch({ type: "SET_THEME" }), []);
  const setLang = useCallback((v) => dispatch({ type: "SET_LANG", v: typeof v === 'function' ? v(lang) : v }), [lang]);
  const setKeepSession = useCallback((v) => { dispatch({ type: "SET_KEEP_SESSION", v }); localStorage.setItem('sip_keep_session', v ? '1' : '0'); }, []);

  useEffect(() => { fetch(API).catch(e => console.warn('Preheat:', e.message)); }, []);
  useEffect(() => { localStorage.setItem('sip_lang', lang); }, [lang]);
  useEffect(() => {
    localStorage.setItem('sip_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => { if (pin && !loggedIn) doLogin(pin); }, []); // eslint-disable-line

  async function doLogin(p) {
    dispatch({ type: "LOGIN_START" });
    try {
      const [userData, katData] = await Promise.all([
        apiCall(API, p),
        apiCall(`${API}?katalog=1`),
      ]);
      if (katData.apiVersion && !katData.apiVersion.startsWith('2.')) {
        console.warn('Katalog API versiyonu uyumsuz:', katData.apiVersion);
      }
      sessionStorage.setItem('sip_pin', p);
      dispatch({
        type: "LOGIN_OK", pin: p,
        musteri: { id: userData.musteriId, ad: userData.musteriAd },
        siparisler: userData.siparisler || [],
        hesap: userData.hesap || null,
        fiyatlar: extractFiyatlar(userData.fiyatlar),
        katalog: katData.urunler || [],
        apiSuppliers: katData.suppliers || [],
        apiKategoriler: katData.kategoriler || [],
      });
    } catch (err) {
      dispatch({ type: "LOGIN_FAIL", error: err.message });
      sessionStorage.removeItem('sip_pin');
    }
  }

  function doLogout() { sessionStorage.removeItem('sip_pin'); dispatch({ type: "LOGOUT" }); }

  // ── İnaktiflik → otomatik çıkış (keepSession kapalıysa) ──
  const inactivityRef = useRef(null);
  useEffect(() => {
    if (!loggedIn || keepSession) {
      if (inactivityRef.current) { clearTimeout(inactivityRef.current); inactivityRef.current = null; }
      return;
    }
    const IDLE_MS = 15 * 60 * 1000;
    const reset = () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      inactivityRef.current = setTimeout(doLogout, IDLE_MS);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [loggedIn, keepSession]); // eslint-disable-line

  const lastRefreshRef = useRef(0);
  const REFRESH_COOLDOWN = 5000; // 5 saniye minimum yenileme aralığı

  async function refreshSiparisler() {
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN) return;
    lastRefreshRef.current = now;
    try {
      const [userData, katData] = await Promise.all([
        apiCall(API, pin),
        apiCall(`${API}?katalog=1`),
      ]);
      dispatch({
        type: "REFRESH_OK",
        siparisler: userData.siparisler || [],
        hesap: userData.hesap || null,
        fiyatlar: extractFiyatlar(userData.fiyatlar),
        katalog: katData.urunler || [],
        apiSuppliers: katData.suppliers || [],
        apiKategoriler: katData.kategoriler || [],
      });
    } catch (err) { console.warn('Yenileme hatası:', err.message); }
  }

  if (!loggedIn) {
    return <LoginScreen t={t} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} loading={loading} error={error} onLogin={doLogin} keepSession={keepSession} setKeepSession={setKeepSession} />;
  }

  return (
    <MainApp
      t={t} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} pin={pin}
      musteri={musteri} katalog={katalog} fiyatlar={fiyatlar}
      siparisler={siparisler} hesap={hesap} refreshSiparisler={refreshSiparisler} sonYenileme={sonYenileme}
      onLogout={doLogout}
    />
  );
}

// ── Login ───────────────────────────────────────────
function LoginScreen({ t, lang, setLang, theme, toggleTheme, loading, error, onLogin, keepSession, setKeepSession }) {
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Hata geldiğinde shake tetikle
  useEffect(() => {
    if (!error) return;
    setShake(true);
    setInput('');
    const tm = setTimeout(() => setShake(false), 400);
    return () => clearTimeout(tm);
  }, [error]);

  const dots = Array.from({ length: 6 }, (_, i) => (
    <div key={`dot-${i}`} className={`sip-pin-dot${i < input.length ? ' filled' : ''}`} />
  ));

  return (
    <div className="sip-login-container">
      <div className={`sip-login-card${shake ? ' sip-shake' : ''}`}>
        <div className="sip-login-toggles">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <LangToggle lang={lang} setLang={setLang} />
        </div>
        <div className="sip-login-icon"><img src={BEKILLI_LOGO} alt="Bekilli Group" /></div>
        <div className="sip-login-title">{t.portal || 'Sipariş Portalı'}</div>
        <p className="sip-login-sub">{t.pin_sub}</p>
        <div className="sip-pin-dots">{dots}</div>
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
        <label className="sip-keep-session">
          <input type="checkbox" checked={keepSession} onChange={e => setKeepSession(e.target.checked)} />
          <span>{t.oturumu_ac}</span>
        </label>
        {!keepSession && <div className="sip-oto-cikis">{t.oto_cikis}</div>}
        {error && <p className="sip-login-error">{t.pin_error}</p>}
      </div>
    </div>
  );
}

// ── MainApp — 2 Page Layout ─────────────────────────
function MainApp({ t, lang, setLang, theme, toggleTheme, pin, musteri, katalog, fiyatlar, siparisler, hesap, refreshSiparisler, sonYenileme, onLogout }) {
  const [page, setPage] = useState('hesabim');
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); }, []);

  // Sayfa geçişinde otomatik yenileme
  const changePage = useCallback((p) => {
    setPage(p);
    refreshSiparisler();
  }, [refreshSiparisler]);

  const bekleyenSayisi = siparisler.filter(s => s.durum === 'beklemede' || s.durum === 'kismi' || s.durum === 'hazirlaniyor').length;
  const okunmamisSayisi = (hesap?.bildirimler || []).filter(b => !b.okundu).length;

  return (
    <div className="sip-app">
      {/* ── Top Nav ── */}
      <nav className="sip-topnav">
        <div className="sip-topnav-logo">
          <img src={BEKILLI_LOGO_NAV} alt="Bekilli Group" className="sip-topnav-logo-img" />
        </div>
        <div className="sip-topnav-center">
          <button className={`sip-page-tab ${page === 'hesabim' ? 'active' : ''}`} onClick={() => changePage('hesabim')}>
            {t.hesabim}
            {okunmamisSayisi > 0 && <span className="sip-notif-dot" />}
          </button>
          <button className={`sip-page-tab ${page === 'siparis' ? 'active' : ''}`} onClick={() => changePage('siparis')}>
            {t.siparis}
            {bekleyenSayisi > 0 && <span className="sip-notif-dot" />}
          </button>
        </div>
        <div className="sip-topnav-right">
          <span className="sip-topnav-user">{musteri.ad}</span>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <LangToggle lang={lang} setLang={setLang} />
          <button className="sip-logout-btn" onClick={onLogout}>{t.cikis}</button>
        </div>
      </nav>

      {/* ── Refresh Bar ── */}
      <div className="sip-refresh">
        <span>{sonYenileme ? sonYenileme.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : "—"}</span>
        <button className="sip-refresh-btn" onClick={refreshSiparisler} title={t.yenile}>↻</button>
      </div>

      {/* ── Pages ── */}
      <div className={`sip-page ${page === 'hesabim' ? 'active' : ''}`}>
        <HesabimPage
          t={t} hesap={hesap} pin={pin} onRefresh={refreshSiparisler}
          fiyatlar={fiyatlar} katalog={katalog}
        />
      </div>
      <div className={`sip-page ${page === 'siparis' ? 'active' : ''}`}>
        <SiparisPage
          t={t} pin={pin} katalog={katalog} fiyatlar={fiyatlar}
          siparisler={siparisler} refreshSiparisler={refreshSiparisler}
          showToast={showToast} sikAlinanlar={hesap?.sikAlinanlar || []}
        />
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <div className="sip-mobile-bar">
        <button className={`sip-mobile-tab ${page === 'hesabim' ? 'active' : ''}`} onClick={() => changePage('hesabim')}>
          <AccountIcon />
          <span>{t.hesabim}</span>
          {okunmamisSayisi > 0 && <span className="sip-notif-dot" />}
        </button>
        <button className={`sip-mobile-tab ${page === 'siparis' ? 'active' : ''}`} onClick={() => changePage('siparis')}>
          <OrderIcon />
          <span>{t.siparis}</span>
          {bekleyenSayisi > 0 && <span className="sip-notif-dot" />}
        </button>
      </div>

      {/* Toast */}
      {toast && <div className="sip-toast">{toast}</div>}
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
