// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal v5 App Shell
// 2 sayfa: Sipariş (3 panel) + Hesabım (3 tab: Faturalar/Ödeme&Tahsilat/Log)
// İş mantığı sayfalarda, burada sadece auth + routing + topnav
// ══════════════════════════════════════════════════════════════════════
import { useState, useReducer, useEffect, useRef, useCallback } from 'react';
import { BEKILLI_LOGO, BEKILLI_LOGO_NAV } from './logos';
import SiparisPage from './SiparisPage';
import HesabimPage from './HesabimPage';

// ── API ─────────────────────────────────────────────
const API = '/api/siparis';
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
    siparis: 'Sipariş', hesabim: 'Hesabım', aktivite: 'Aktivite', cikis: 'Çıkış', yenile: 'Yenile', portal: 'Sipariş Portalı',
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
    faturalar: 'Faturalar', odeme_tahsilat: 'Ödeme & Tahsilat',
    son_odemeler: 'Son ödemeler', son_islemler: 'Son işlemler',
    hesap_hareketleri: 'Hesap hareketleri',
    acik_fatura_yok: 'Açık fatura bulunmuyor', iade_yok: 'İade bulunmuyor',
    bildirim_yok: 'Bildirim yok', odeme_yok: 'Ödeme geçmişi yok',
    tumunu_oku: 'Tümünü okundu yap', hesap_bos: 'Hesap bilgisi henüz oluşturulmadı.',
  },
  en: {
    siparis: 'Order', hesabim: 'Account', aktivite: 'Activity', cikis: 'Logout', yenile: 'Refresh', portal: 'Order Portal',
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
    faturalar: 'Invoices', odeme_tahsilat: 'Payment & Collection',
    son_odemeler: 'Recent payments', son_islemler: 'Recent transactions',
    hesap_hareketleri: 'Account transactions',
    acik_fatura_yok: 'No open invoices', iade_yok: 'No returns',
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

  useEffect(() => { fetch(API).catch(e => console.warn('Preheat:', e.message)); if(typeof __BUILD_TIME__!=='undefined') console.log('Build:', __BUILD_TIME__); }, []);
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
  const shortName = (musteri.ad || '').split(' ').map((w, i) => i === 0 ? w : w[0] + '.').join(' ');

  return (
    <div className="sip-app">
      {/* ── Top Nav (3-zone symmetric grid) ── */}
      <nav className="sip-topnav">
        <div className="sip-topnav-logo">
          <img className="sip-topnav-logo-img" src={BEKILLI_LOGO_NAV} alt="Bekilli Group" />
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
          <span className="sip-topnav-user">{shortName}</span>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <LangToggle lang={lang} setLang={setLang} />
          <button className="sip-logout-btn" onClick={onLogout}>{t.cikis}</button>
          <button className="sip-logout-icon" onClick={onLogout} title={t.cikis}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
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
