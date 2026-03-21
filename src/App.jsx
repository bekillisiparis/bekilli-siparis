// ══════════════════════════════════════════════════════════════════════
//  BEKİLLİ GROUP — STOK & CARİ SİSTEMİ  v8.1
//  Multi-file React + Vite · Vercel deploy
//  v8.0: Multi-file migrasyonu (Faz 1)
//  v8.1: Kod kalitesi + Multi-file Faz 2
//    — Hardcoded renkler → G tokenları (dark mode uyumlu)
//    — 14 boş catch → console.warn
//    — hesaplaCariOzet kur tutarsızlığı giderildi
//    — hashPin → helpers.js'e taşındı
//    — pages/TopluImport.jsx, pages/Raporlama.jsx,
//      pages/CloudSync.jsx, pages/CariDetay.jsx ayrıldı
//    — components/shared.jsx oluşturuldu
// ══════════════════════════════════════════════════════════════════════
//  DOSYA YAPISI
//  ──────────────────────────────────────────────────────────────────
//  src/
//    main.jsx               Giriş noktası (React mount)
//    App.jsx                Ana uygulama (bu dosya)
//    styles.css             Tüm CSS (responsive dahil)
//    utils/
//      constants.js         Sabitler & design tokens
//      helpers.js           Yardımcı fonksiyonlar + hashPin
//      storage.js           localStorage · Gist sync · kur çekme
//    components/
//      ui.jsx               UI Kit (Row, Card, Btn, F, FS, Toast...)
//      shared.jsx           UrunInput · GrupluHareketler · grupHareketler
//    pages/
//      TopluImport.jsx      Toptan Alış + Toplu Satış Excel import
//      Raporlama.jsx        Kasa · Alış/Satış · Ürün Analizi
//      CloudSync.jsx        Bulut senkron · günlük yedek · PinDegistir
//      CariDetay.jsx        Tam sayfa cari · FIFO · Excel · PDF ekstre
//  ──────────────────────────────────────────────────────────────────
//  BU DOSYANIN İÇİNDEKİLER
//  ──────────────────────────────────────────────────────────────────
//  §6  Hata Yönetimi            logError · ErrorBoundary · ErrorLogPanel
//  §7  PIN Giriş                LoginScreen
//  §8  Ana Uygulama             App → AppMain (state · hesaplar · kur)
//  §9  Navigasyon               Sidebar (menü · çıkış)
//  §10 Modüller
//      10.1 Dashboard            Özet kartlar · son hareketler
//      10.4 Ürünler              Ürün yönetimi
//      10.4a UrunDetay           Tam sayfa ürün detayı
//      10.4b CariDetayModal      Popup wrapper
//      10.6a TumHareketler       Tüm hareketler sayfası
//      10.7 Firmalar             Müşteri & tedarikçi yönetimi
// ══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ── Modül İmportları ──
import "./styles.css";
import { G, TIP_LABEL, LOGO_SIDEBAR, LOGO_ICON, LOGO_LOGIN, PIN_HASH, LOCK_STEPS } from "./utils/constants";
import { uid, sf, fmt, fmtD, today, hashPin, hesaplaCariOzet } from "./utils/helpers";
import { dbLoad, dbSave, gistGetConfig, gistFetch, gistDailyBackup, debouncedGistSync, fetchKurlar } from "./utils/storage";
import { Row, Card, Btn, PageHeader, SearchBar, Grid2, F, FS, TD, Pill, Lnk, Empty, Toast, useSortable, SortTh } from "./components/ui";
import TopluImport from "./pages/TopluImport";
import Raporlama from "./pages/Raporlama";
import CloudSync from "./pages/CloudSync";
import CariDetay from "./pages/CariDetay";
import Urunler, { UrunDetay, CariDetayModal } from "./pages/Urunler";
import { GrupluHareketler, grupHareketler, BklSelect } from "./components/shared";
import SiparisYonetimi from "./pages/SiparisYonetimi";


// ── §7 PIN GİRİŞ KORUMASI ───────────────────────────────────────────────

// Brute-force kilitleme: 5→30sn, 10→5dk, 20→30dk
function getLockState() {
  try {
    const v = JSON.parse(localStorage.getItem("bkl_lock")||"{}");
    return { fails: v.fails||0, until: v.until||0 };
  } catch(e) { console.warn("bkl_lock okuma hatası:",e); return { fails:0, until:0 }; }
}
function setLockState(fails, until) {
  try { localStorage.setItem("bkl_lock", JSON.stringify({fails,until})); } catch(e) { console.warn("bkl_lock yazma hatası:",e); }
}

function LoginScreen({ onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [locked, setLocked] = useState(0); // kalan saniye
  const inputRef = useRef(null);

  // Kilit geri sayımı
  useEffect(() => {
    const check = () => {
      const { until } = getLockState();
      const rem = Math.max(0, Math.ceil((until - Date.now())/1000));
      setLocked(rem);
    };
    check();
    const iv = setInterval(check, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { if (locked===0) inputRef.current?.focus(); }, [locked]);

  const handleSubmit = async () => {
    if (locked>0) return;
    const h = await hashPin(pin);
    const activeHash = localStorage.getItem("bkl_pin_hash") || PIN_HASH;
    if (h === activeHash) {
      setLockState(0, 0);
      sessionStorage.setItem("bkl_auth", "1");
      onSuccess();
    } else {
      const { fails } = getLockState();
      const nf = fails + 1;
      const step = [...LOCK_STEPS].reverse().find(s=>nf>=s.tries);
      const until = step ? Date.now()+step.sec*1000 : 0;
      setLockState(nf, until);
      if (step) setLocked(step.sec);
      setError(true);
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 500);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  const lockMsg = locked>0
    ? locked>=60 ? `${Math.ceil(locked/60)} dk bekleyin` : `${locked} sn bekleyin`
    : null;

  const dots = Array.from({length:6}, (_,i) => (
    <div key={`dot-${i}`} style={{
      width:16, height:16, borderRadius:"50%",
      background: i < pin.length ? G.blue : "transparent",
      border: i < pin.length ? "none" : "2px solid rgba(255,255,255,0.2)",
      transition: "all .15s"
    }}/>
  ));

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background: "linear-gradient(135deg, #0A0E15 0%, #212631 50%, #373F4E 100%)",
      fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
    }}>
      <div style={{
        background:"rgba(255,255,255,0.07)", backdropFilter:"blur(24px) saturate(1.3)",
        WebkitBackdropFilter:"blur(24px) saturate(1.3)",
        borderRadius:24, padding:"48px 40px",
        boxShadow:"0 0 1px rgba(0,0,0,0.3),0 4px 8px rgba(0,0,0,0.25),0 12px 24px rgba(0,0,0,0.3),0 24px 48px rgba(0,0,0,0.2)",
        border:"1px solid rgba(255,255,255,0.1)",
        width:340, textAlign:"center",
        animation: shake ? "shake .4s ease" : "fadeUp .4s ease"
      }}>
        <img className="bkl-logo" src={LOGO_LOGIN} alt="Bekilli Group" style={{height:60,marginBottom:20,objectFit:"contain",filter:"brightness(1.8) contrast(0.9)"}} />
        <div style={{fontSize:12, color:"#9BA3B5", marginBottom:28, fontWeight:500}}>Stok & Cari Yönetim Sistemi</div>

        <div style={{display:"flex", justifyContent:"center", gap:10, marginBottom:24}}>{dots}</div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={e => { setError(false); setPin(e.target.value.replace(/\D/g,"")); }}
          onKeyDown={handleKey}
          placeholder="● ● ● ● ● ●"
          disabled={locked>0}
          className="bkl-pin-input"
          style={{
            width:"100%", textAlign:"center", fontSize:24, fontWeight:700, letterSpacing:12,
            padding:"14px 16px", borderRadius:14,
            border: `2px solid ${locked>0 ? G.orange : error ? G.red : "rgba(255,255,255,0.1)"}`,
            background: locked>0 ? "rgba(255,149,0,0.08)" : error ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.06)",
            color: "#FFFFFF", outline:"none", boxSizing:"border-box",
            opacity: locked>0 ? 0.5 : 1
          }}
        />

        {lockMsg && (
          <div style={{fontSize:12, color:G.orange, fontWeight:700, marginTop:10}}>
            🔒 Çok fazla yanlış deneme. {lockMsg}
          </div>
        )}

        {error && !lockMsg && (
          <div style={{fontSize:12, color:G.red, fontWeight:600, marginTop:10}}>
            Yanlış PIN. Tekrar deneyin.
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={pin.length !== 6 || locked>0}
          style={{
            width:"100%", marginTop:16, padding:"14px", borderRadius:24, border:"none",
            background: pin.length === 6 && locked===0 ? G.blue : "rgba(255,255,255,0.08)",
            color: pin.length === 6 && locked===0 ? "#fff" : "#3E4556",
            fontSize:15, fontWeight:600, cursor: pin.length === 6 && locked===0 ? "pointer" : "default",
            transition:"all .2s",
            boxShadow: pin.length === 6 && locked===0 ? "0 0 24px rgba(59,130,246,0.25)" : "none"
          }}
        >
          Giriş Yap
        </button>
      </div>

      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
      `}</style>
    </div>
  );
}
// ── §6 HATA YÖNETİMİ (logError · ErrorBoundary · ErrorLogPanel) ─────────
const _errorLog = (() => { try { return JSON.parse(localStorage.getItem("bkl_errorlog")||"[]"); } catch(e) { console.warn("bkl_errorlog okuma hatası:",e); return []; } })();
const _errorListeners = new Set();
function _saveErrorLog() { try { localStorage.setItem("bkl_errorlog", JSON.stringify(_errorLog.slice(0,50))); } catch(e) { console.warn("bkl_errorlog yazma hatası:",e); } }
function logError(msg, stack="") {
  _errorLog.unshift({ id: Date.now(), ts: new Date().toLocaleString("tr-TR"), msg: String(msg).slice(0,500), stack: String(stack||"").slice(0,1000) });
  if (_errorLog.length > 50) _errorLog.length = 50;
  _saveErrorLog();
  _errorListeners.forEach(fn=>fn([..._errorLog]));
}
function useErrorLog() {
  const [log, setLog] = useState([..._errorLog]);
  useEffect(()=>{ _errorListeners.add(setLog); return ()=>_errorListeners.delete(setLog); },[]);
  return log;
}

// ── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null,info:null}; }
  static getDerivedStateFromError(e){ return {err:e}; }
  componentDidCatch(e,info){
    logError(e?.message||"Bilinmeyen render hatası", e?.stack||info?.componentStack||"");
  }
  render(){
    if(this.state.err) return (
      React.createElement("div",{style:{padding:40,textAlign:"center",fontFamily:"-apple-system,sans-serif",background:G.pageBg,color:G.t1}},
        React.createElement("div",{style:{fontSize:48,marginBottom:12}},"⚠️"),
        React.createElement("h2",{style:{color:G.red,marginBottom:8}},"Bir hata oluştu"),
        React.createElement("p",{style:{color:G.t2,marginBottom:16,fontSize:13}},this.state.err?.message||"Beklenmeyen hata"),
        React.createElement("button",{onClick:()=>this.setState({err:null,info:null}),
          style:{padding:"10px 24px",borderRadius:20,border:"none",background:G.blue,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}},"🏠 Ana Sayfaya Dön"),
        React.createElement("p",{style:{color:G.t3,fontSize:10,marginTop:12}},"Hata detayları 🐛 hata günlüğünde kayıtlıdır.")
      )
    );
    return this.props.children;
  }
}

// ── HATA GÜNLÜĞÜ PANELİ ─────────────────────────────────────────────────────
function ErrorLogPanel({ onClose }) {
  const log = useErrorLog();
  const kopyala = (e) => {
    const txt = log.map(l=>`[${l.ts}] ${l.msg}\n${l.stack}`).join("\n---\n");
    navigator.clipboard.writeText(txt).catch(e => console.warn("Kopyalama başarısız:",e));
  };
  const kopyalaTek = (item) => {
    navigator.clipboard.writeText(`[${item.ts}] ${item.msg}\n${item.stack}`).catch(e => console.warn("Kopyalama başarısız:",e));
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(6px)",zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="bkl-errorlog-box" style={{background:G.popupBg,backdropFilter:"blur(16px)",borderRadius:16,width:"100%",maxWidth:640,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:G.shadow}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${G.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:800,fontSize:14,color:G.t1}}>🐛 Hata Günlüğü <span style={{fontWeight:400,fontSize:11,color:G.t3}}>({log.length})</span></div>
          <div style={{display:"flex",gap:8}}>
            {log.length>0 && <button onClick={kopyala} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${G.border}`,background:G.inputBg,color:G.t1,fontSize:11,fontWeight:600,cursor:"pointer"}}>📋 Tümünü Kopyala</button>}
            {log.length>0 && <button onClick={()=>{_errorLog.length=0;_saveErrorLog();_errorListeners.forEach(fn=>fn([]));}} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${G.border}`,background:G.inputBg,color:G.red,fontSize:11,fontWeight:600,cursor:"pointer"}}>🗑 Temizle</button>}
            <button onClick={onClose} style={{padding:"5px 10px",borderRadius:20,border:`1px solid ${G.border}`,background:G.cardBg,color:G.t2,fontSize:13,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
          {log.length===0 && <div style={{textAlign:"center",padding:40,color:G.t3,fontSize:13}}>Henüz hata yok ✅</div>}
          {log.map(item=>(
            <div key={item.id} style={{padding:"10px 12px",marginBottom:6,background:G.redL,border:`1px solid rgba(255,59,48,0.12)`,borderRadius:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,color:G.t3,marginBottom:3}}>{item.ts}</div>
                  <div style={{fontSize:12,fontWeight:700,color:G.red,wordBreak:"break-word"}}>{item.msg}</div>
                  {item.stack && <pre style={{fontSize:9,color:G.t3,marginTop:4,whiteSpace:"pre-wrap",wordBreak:"break-all",maxHeight:80,overflow:"auto",background:"rgba(0,0,0,0.03)",padding:6,borderRadius:6}}>{item.stack.slice(0,300)}</pre>}
                </div>
                <button onClick={()=>kopyalaTek(item)} title="Kopyala" style={{background:"none",border:"none",fontSize:14,cursor:"pointer",padding:4,flexShrink:0}}>📋</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorLogButton({ onClick }) {
  const log = useErrorLog();
  const count = log.length;
  return (
    <button onClick={onClick} title="Hata Günlüğü" style={{background:"none",border:"none",fontSize:13,color:count>0?G.red:G.t3,cursor:"pointer",padding:"2px 6px",borderRadius:20,position:"relative"}}>
      🐛
      {count>0 && <span style={{position:"absolute",top:-4,right:-2,background:G.red,color:"#fff",fontSize:8,fontWeight:800,borderRadius:10,padding:"1px 4px",minWidth:14,textAlign:"center",lineHeight:"12px"}}>{count>9?"9+":count}</span>}
    </button>
  );
}

// ── §8 ANA UYGULAMA (App → AppMain · state · hesaplar · kur) ────────────
export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("bkl_auth") === "1");

  const logout = () => { sessionStorage.removeItem("bkl_auth"); setAuthed(false); };

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  return <AppMain onLogout={logout} />;
}

function AppMain({ onLogout }) {
  const [page, setPage]   = useState("dashboard");
  const [data, setData]   = useState(null);
  const [loading, setL]   = useState(true);
  const [toast, setToast] = useState(null);
  const [kurBusy, setKB]  = useState(false);
  const [cloudStatus, setCloudStatus] = useState(""); // "syncing"|"ok"|"error"|""
  const dataRef = useRef(null);
  const showToast = (msg, type="ok") => {
    setToast({msg,type}); setTimeout(()=>setToast(null),3200);
    if (type==="warn"||type==="err") logError(msg, new Error().stack);
  };

  // Keep dataRef in sync
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    // Global hata yakalayıcıları
    const onErr = (e) => logError(e?.message||"JS Hatası", e?.error?.stack||"");
    const onRej = (e) => logError("Unhandled Promise: "+(e?.reason?.message||e?.reason||"?"), e?.reason?.stack||"");
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    (async () => {
      // 1. Önce local storage'dan yükle
      const [urunler,musteriler,tedarikciler,hareketler,kurlar,urunFiyatlari] = await Promise.all([
        dbLoad("bkl_urunler"), dbLoad("bkl_musteriler"),
        dbLoad("bkl_tedarikciler"), dbLoad("bkl_hareketler"), dbLoad("bkl_kurlar"),
        dbLoad("bkl_urunFiyatlari")
      ]);
      let localData = {
        urunler: urunler||[], musteriler: musteriler||[],
        tedarikciler: tedarikciler||[], hareketler: hareketler||[],
        kurlar: kurlar&&kurlar.USD ? kurlar : { USD:32.5, EUR:35.2, tarih:today() },
        urunFiyatlari: urunFiyatlari||{}
      };

      // 2. Gist'ten çekmeyi dene
      try {
        const cfg = await gistGetConfig();
        if (cfg?.token && cfg?.gistId && cfg?.autoSync) {
          setCloudStatus("syncing");
          const cloud = await gistFetch(cfg.token, cfg.gistId);
          if (cloud?.versiyon?.startsWith("bekilli")) {
            // Cloud verisi varsa local'ı güncelle
            localData = {
              urunler: cloud.urunler||[], musteriler: cloud.musteriler||[],
              tedarikciler: cloud.tedarikciler||[], hareketler: cloud.hareketler||[],
              kurlar: cloud.kurlar&&cloud.kurlar.USD ? cloud.kurlar : localData.kurlar,
              urunFiyatlari: cloud.urunFiyatlari||{}
            };
            // Local storage'ı da güncelle
            await dbSave("bkl_urunler", localData.urunler);
            await dbSave("bkl_musteriler", localData.musteriler);
            await dbSave("bkl_tedarikciler", localData.tedarikciler);
            await dbSave("bkl_hareketler", localData.hareketler);
            await dbSave("bkl_kurlar", localData.kurlar);
            await dbSave("bkl_urunFiyatlari", localData.urunFiyatlari);
            // PIN hash sync — buluttan gelen hash'i lokale yaz
            if (cloud.pinHash) localStorage.setItem("bkl_pin_hash", cloud.pinHash);
            // §3c Lazer birim maliyet default sync
            if (cloud.lazerBirimMaliyet) localStorage.setItem("bkl_lazerBirimMaliyet", cloud.lazerBirimMaliyet);
            setCloudStatus("ok");
          }
          // 3. Günlük otomatik yedek al (arka planda)
          gistDailyBackup(cfg.token, cfg.gistId, localData);
        }
      } catch(e) {
        console.warn("Gist ilk yükleme hatası:", e);
        setCloudStatus("error");
      }

      setData(localData);
      setL(false);

      // 4. Kur otomatik güncelle (arka planda)
      try {
        const nk = await fetchKurlar();
        if (nk) {
          dbSave("bkl_kurlar",nk);
          setData(prev => prev ? {...prev, kurlar:nk} : prev);
        }
      } catch(e) { console.warn("Kur güncelleme hatası:",e); }
    })();
    return ()=>{ window.removeEventListener("error",onErr); window.removeEventListener("unhandledrejection",onRej); };
  }, []);

  const update = useCallback((k, v) => {
    dbSave("bkl_"+k, v);
    setData(p => p ? {...p,[k]:v} : p);
    debouncedGistSync(() => dataRef.current ? {...dataRef.current,[k]:v} : null);
    setCloudStatus("syncing");
    setTimeout(()=>setCloudStatus(s=>s==="syncing"?"ok":s), 4000);
  }, []);

  // Birden fazla key'i aynı anda güncelle — race condition önler
  const updateBatch = useCallback((updates) => {
    Object.entries(updates).forEach(([k, v]) => dbSave("bkl_"+k, v));
    setData(p => p ? {...p, ...updates} : p);
    debouncedGistSync(() => dataRef.current ? {...dataRef.current, ...updates} : null);
    setCloudStatus("syncing");
    setTimeout(()=>setCloudStatus(s=>s==="syncing"?"ok":s), 4000);
  }, []);

  const kurGuncelle = async () => {
    setKB(true);
    const nk = await fetchKurlar();
    if (nk) {
      update("kurlar",nk);
      showToast(`✅ 1 USD = ${fmt(nk.USD)} ₺  ·  1 EUR = ${fmt(nk.EUR)} ₺`);
    } else {
      showToast("Kur çekilemedi, manuel girin","warn");
    }
    setKB(false);
  };

  const stokHesapla = useCallback((urunId) => {
    if (!data) return 0;
    return data.hareketler.filter(h=>h.urunId===urunId)
      .reduce((a,h) => a + (["giris","alis"].includes(h.tip) ? +h.miktar : -Math.abs(+h.miktar)), 0);
  }, [data]);

  const cariHesapla = useCallback((firmaId, tip) => {
    if (!data) return 0;
    const isMus = tip === "musteri";
    const firmaH = data.hareketler.filter(h => h.firmaId === firmaId);
    return hesaplaCariOzet(firmaH, isMus, data.kurlar).bakiye;
  }, [data]);

  const [collapsed, setCollapsed] = useState(false);
  const [errorLogOpen, setErrorLogOpen] = useState(false);
  const [cariFirma, setCariFirma] = useState(null); // {firma, tip, irsaliyeNo} — CariDetay tam sayfa için
  const openCari = (firma, tip, irsaliyeNo) => { setCariFirma({firma, tip, irsaliyeNo: irsaliyeNo||null}); setPage("cari_detay"); };
  const [cariOverlay, setCariOverlay] = useState(null); // {firma, tip, irsaliyeNo} — CariDetay overlay için
  const openCariOverlay = (firma, tip, irsaliyeNo) => setCariOverlay({firma, tip, irsaliyeNo: irsaliyeNo||null});
  const [acikUrun, setAcikUrun] = useState(null); // UrunDetay tam sayfa için

  // Theme: "auto" | "light" | "dark"
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("bkl_theme");
    if (saved==="dark") return true;
    if (saved==="light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const toggleTheme = () => setIsDark(d => !d);
  useEffect(() => {
    localStorage.setItem("bkl_theme", isDark?"dark":"light");
    document.documentElement.setAttribute("data-theme", isDark?"dark":"light");
  }, [isDark]);

  if (loading) return (
    <div style={{background:G.pageBg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12,animation:"shimmer 1.5s infinite"}}>⚙️</div>
        <div style={{fontSize:13,color:G.t3,fontWeight:500}}>Bekilli Sistemi Yükleniyor…</div>
      </div>
    </div>
  );

  const pages = {
    dashboard:        <Dashboard data={data} stokHesapla={stokHesapla} cariHesapla={cariHesapla} setPage={setPage} kurGuncelle={kurGuncelle} kurBusy={kurBusy} />,
    tum_hareketler:   <TumHareketler data={data} update={update} updateBatch={updateBatch} showToast={showToast} cariHesapla={cariHesapla} onCariGit={openCariOverlay} />,
    toptan_alis:      <TopluImport key="toptan_alis" mod="alis"  data={data} update={update} updateBatch={updateBatch} showToast={showToast} />,
    toplu_satis:      <TopluImport key="toplu_satis" mod="satis" data={data} update={update} updateBatch={updateBatch} showToast={showToast} />,
    urunler:          <Urunler data={data} update={update} stokHesapla={stokHesapla} showToast={showToast} onUrunDetay={u=>{setAcikUrun(u);setPage("urun_detay");}} />,
    urun_detay:       acikUrun ? (() => { const liveUrun = data.urunler.find(u=>u.id===acikUrun.id)||acikUrun; return <UrunDetay urun={liveUrun} data={data} update={update} updateBatch={updateBatch} showToast={showToast} stokHesapla={stokHesapla} cariHesapla={cariHesapla} onClose={()=>setPage("urunler")} />; })() : null,
    musteriler:       <Firmalar data={data} update={update} showToast={showToast} tip="musteri" cariHesapla={cariHesapla} onCariAc={f=>openCari(f,"musteri")} />,
    tedarikciler:     <Firmalar data={data} update={update} showToast={showToast} tip="tedarikci" cariHesapla={cariHesapla} onCariAc={f=>openCari(f,"tedarikci")} />,
    siparis_yonetimi: <SiparisYonetimi data={data} showToast={showToast} stokHesapla={stokHesapla} update={update} updateBatch={updateBatch} />,
    cloud_sync:       <CloudSync data={data} setData={setData} showToast={showToast} cloudStatus={cloudStatus} setCloudStatus={setCloudStatus} />,
    raporlama:        <Raporlama data={data} update={update} showToast={showToast} onFaturaGit={(faturaRef)=>{
      const h = data.hareketler.find(x=>x.irsaliyeNo===faturaRef && x.firmaId);
      if (!h) { showToast("Fatura bulunamadı","warn"); return; }
      const firma = [...data.musteriler,...data.tedarikciler].find(f=>f.id===h.firmaId);
      if (!firma) { showToast("Firma bulunamadı","warn"); return; }
      const tip = data.musteriler.some(m=>m.id===firma.id) ? "musteri" : "tedarikci";
      openCariOverlay(firma, tip, faturaRef);
    }} onCariGit={(firmaId, irsaliyeNo)=>{
      const firma = [...data.musteriler,...data.tedarikciler].find(f=>f.id===firmaId);
      if (!firma) { showToast("Firma bulunamadı","warn"); return; }
      const tip = data.musteriler.some(m=>m.id===firma.id) ? "musteri" : "tedarikci";
      openCariOverlay(firma, tip, irsaliyeNo);
    }} />,
    cari_detay:       cariFirma ? <CariDetay firma={cariFirma.firma} tip={cariFirma.tip} data={data} cariHesapla={cariHesapla} stokHesapla={stokHesapla} update={update} updateBatch={updateBatch} showToast={showToast} onClose={()=>setPage(cariFirma.tip==="musteri"?"musteriler":"tedarikciler")} openIrsaliye={cariFirma.irsaliyeNo} /> : null,
  };

  return (
    <div data-theme={isDark?"dark":"light"} style={{display:"flex",minHeight:"100vh",background:G.pageBg,fontFamily:"-apple-system,'SF Pro Display','Segoe UI',sans-serif",color:G.t1}}>
      {/* Mobil sidebar overlay — genişletildiğinde içeriği karartır */}
      {!collapsed && <div className="bkl-sidebar-overlay" onClick={()=>setCollapsed(true)} />}
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} cloudStatus={cloudStatus} onLogout={onLogout} onErrorLog={()=>setErrorLogOpen(true)} isDark={isDark} toggleTheme={toggleTheme} />
      <ErrorBoundary>
        <div className="bkl-content" style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"24px 20px",minWidth:0}}>
          {pages[page]||pages.dashboard}
        </div>
      </ErrorBoundary>
      {toast && <Toast {...toast} />}
      {errorLogOpen && <ErrorLogPanel onClose={()=>setErrorLogOpen(false)} />}

      {/* ── CARİ OVERLAY (TümHareketler/Raporlama'dan popup) ── */}
      {cariOverlay && (
        <div className="bkl-cari-overlay-bg" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)",zIndex:8500,display:"flex",justifyContent:"flex-start",alignItems:"flex-start",overflowY:"auto",padding:"16px"}}
          onClick={e=>{if(e.target===e.currentTarget) setCariOverlay(null);}}>
          <div className="bkl-cari-overlay-box" style={{background:G.pageBg,borderRadius:18,width:"100%",maxWidth:1200,margin:"0 auto",boxShadow:"0 24px 80px rgba(0,0,0,0.35)",position:"relative"}}>
            <div style={{position:"sticky",top:0,zIndex:10,background:G.pageBg,borderRadius:"18px 18px 0 0",padding:"8px 16px",display:"flex",justifyContent:"flex-end",borderBottom:`1px solid ${G.border}22`}}>
              <button onClick={()=>setCariOverlay(null)}
                style={{background:"rgba(0,0,0,0.06)",border:"none",borderRadius:20,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600,color:G.t2}}>✕ Kapat</button>
            </div>
            <div style={{padding:"0 20px 20px"}}>
              <CariDetay
                firma={cariOverlay.firma}
                tip={cariOverlay.tip}
                data={data}
                cariHesapla={cariHesapla}
                stokHesapla={stokHesapla}
                update={update}
                updateBatch={updateBatch}
                showToast={showToast}
                onClose={()=>setCariOverlay(null)}
                openIrsaliye={cariOverlay.irsaliyeNo}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── §9 NAVİGASYON (Sidebar) ────────────────────────────────
function Sidebar({ page, setPage, collapsed, setCollapsed, cloudStatus, onLogout, onErrorLog, isDark, toggleTheme }) {
  const W = collapsed ? 52 : 220;
  const themeIcon = isDark ? "🌙" : "☀️";
  const themeLabel = isDark ? "Açık Moda Geç" : "Koyu Moda Geç";

  const cloudIcon = cloudStatus==="syncing" ? "🔄" : cloudStatus==="ok" ? "☁️" : cloudStatus==="error" ? "⚠️" : "☁️";
  const items = [
    {id:"dashboard",       icon:"⬡",  label:"Dashboard"},
    {id:"tum_hareketler",  icon:"📋", label:"Tüm Hareketler"},
    {id:"toptan_alis",     icon:"📦", label:"Toptan Alış"},
    {id:"toplu_satis",     icon:"🧾", label:"Toplu Satış"},
    {id:"urunler",     icon:"🗂", label:"Ürünler"},
    {id:"musteriler",       icon:"🏢", label:"Müşteriler"},
    {id:"tedarikciler",     icon:"🚚", label:"Tedarikçiler"},
    {id:"raporlama",        icon:"📊", label:"Raporlama"},
    {id:"siparis_yonetimi", icon:"🛒", label:"Sipariş Yönetimi"},
    {id:"cloud_sync",       icon:cloudIcon, label:"Bulut Senkron"},
  ];

  return (
    <div className={`bkl-sidebar${!collapsed?" bkl-sidebar-expanded":""}`} style={{width:W,minWidth:W,background:G.sideGlass,backdropFilter:"blur(20px)",borderRight:`1px solid ${G.border}`,display:"flex",flexDirection:"column",boxShadow:"2px 0 12px rgba(0,0,0,0.04)",transition:"width .2s,min-width .2s",overflow:"hidden"}}>
      {/* Header + collapse toggle */}
      <div style={{padding:collapsed?"12px 10px":"16px 14px 14px",borderBottom:`1px solid ${G.border}`,display:"flex",alignItems:"center",justifyContent:collapsed?"center":"space-between",gap:8}}>
        {collapsed
          ? <img className="bkl-logo" src={LOGO_ICON} alt="BG" style={{height:30,objectFit:"contain",cursor:"pointer"}} onClick={()=>setCollapsed(false)} />
          : <img className="bkl-logo" src={LOGO_SIDEBAR} alt="Bekilli Group" style={{height:30,objectFit:"contain",flexShrink:1,minWidth:0}} />
        }
        {!collapsed && <button onClick={()=>setCollapsed(c=>!c)} title="Daralt"
          style={{background:"rgba(0,0,0,0.05)",border:"none",borderRadius:14,width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:G.t3,flexShrink:0,transition:"all .15s"}}>
          ◀
        </button>}
      </div>
      {/* Nav items */}
      <nav style={{padding:"10px 6px",flex:1,overflowY:"auto",overflowX:"hidden"}}>
        {items.map((item,i) => {
          const active = page===item.id;
          return (
            <button key={item.id} className="bkl-nav" onClick={()=>setPage(item.id)}
              title={collapsed?item.label:""}
              style={{display:"flex",alignItems:"center",gap:collapsed?0:8,width:"100%",
                padding:collapsed?"9px 0":"8px 10px",borderRadius:10,border:"none",justifyContent:collapsed?"center":"flex-start",
                background:active?"rgba(59,130,246,0.1)":"transparent",
                color:active?G.blue:G.t2,cursor:"pointer",fontSize:collapsed?18:13,fontWeight:active?700:400,
                marginBottom:2,transition:"all .15s"}}>
              <span style={{fontSize:collapsed?18:15,width:collapsed?28:20,textAlign:"center",flexShrink:0}}>{item.icon}</span>
              {!collapsed && <span style={{flex:1,textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.label}</span>}
              {!collapsed && active && <span style={{width:4,height:4,borderRadius:"50%",background:G.blue,flexShrink:0}}/>}
            </button>
          );
        })}
      </nav>
      {/* Bottom — tema / hata / çıkış */}
      <div style={{padding:collapsed?"10px 6px":"6px 16px 10px",borderTop:`1px solid ${G.border}`,display:"flex",flexDirection:collapsed?"column":"row",justifyContent:collapsed?"center":"space-between",alignItems:"center",gap:collapsed?4:0}}>
        {!collapsed && <span style={{fontSize:9,color:G.t3}}>Bekilli Group © 2025–2026</span>}
        <div style={{display:"flex",flexDirection:collapsed?"column":"row",gap:4,alignItems:"center"}}>
          <button onClick={toggleTheme} title={themeLabel}
            style={{background:"rgba(0,0,0,0.05)",border:"none",borderRadius:20,padding:"2px 6px",cursor:"pointer",fontSize:collapsed?16:13}}>
            {themeIcon}
          </button>
          <ErrorLogButton onClick={onErrorLog} />
          <button onClick={onLogout} title="Çıkış Yap" style={{background:"none",border:"none",fontSize:collapsed?16:11,color:G.t3,cursor:"pointer",padding:collapsed?4:"2px 6px",borderRadius:20}}>🚪</button>
        </div>
      </div>
    </div>
  );
}

// ── §10.1 Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ data, stokHesapla, cariHesapla, setPage, kurGuncelle, kurBusy }) {
  const { urunler, musteriler, tedarikciler, kurlar, hareketler } = data;
  const kritikStoklar = urunler.filter(u => !u.arsiv && u.minStok && stokHesapla(u.id) <= +u.minStok);
  const toplamAlacak  = musteriler.reduce((s,m)=>s+Math.max(0,cariHesapla(m.id,"musteri")),0);
  const toplamBorc    = tedarikciler.reduce((s,t)=>s+Math.max(0,cariHesapla(t.id,"tedarikci")),0);
  const stokDegeri    = urunler.filter(u=>!u.arsiv).reduce((s,u)=>{
    const st=Math.max(0,stokHesapla(u.id));
    const fiyat=sf(u.alisFiyati);
    if (st<=0 || fiyat<=0) return s;
    const pb=u.alisParaBirimi||"USD";
    const tlCarpan = pb==="TL" ? 1 : pb==="EUR" ? (kurlar.EUR||1) : (kurlar.USD||1);
    return s + st * fiyat * tlCarpan;
  },0);
  const sonGruplar = useMemo(() => {
    const sorted = [...hareketler].sort((a,b)=>b.tarih>a.tarih?1:-1);
    const gruplar = grupHareketler(sorted);
    // En yeni 6 grup (tarih sıralı — son tarihe göre ters çevir)
    return gruplar.sort((a,b)=>b[0].tarih>a[0].tarih?1:-1).slice(0,6);
  }, [hareketler]);

  const cards = [
    {l:"Toplam Ürün",    v:urunler.length,              u:"çeşit",c:G.blue,  bg:G.blueL,  i:"📦"},
    {l:"Stok Değeri",    v:fmt(stokDegeri,0)+" ₺",      u:"",     c:G.green, bg:G.greenL, i:"💰"},
    {l:"Toplam Alacak",  v:fmt(toplamAlacak,0)+" $",     u:"",     c:G.orange,bg:G.orangeL,i:"📈"},
    {l:"Toplam Borç",    v:fmt(toplamBorc,0)+" $",       u:"",     c:G.red,   bg:G.redL,   i:"📉"},
  ];

  return (
    <div>
      <div style={{marginBottom:28}}>
        <h1 style={{fontSize:26,fontWeight:800,letterSpacing:-.5}}>Dashboard</h1>
        <p style={{color:G.t3,fontSize:12,marginTop:5}}>
          {new Date().toLocaleDateString("tr-TR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          {"  ·  "}
          <span style={{color:G.blue,fontWeight:600}}>1 USD = {fmt(kurlar.USD)} ₺</span>
          {"  ·  "}
          <span style={{color:G.purple,fontWeight:600}}>1 EUR = {fmt(kurlar.EUR)} ₺</span>
          {"  "}
          <button onClick={kurGuncelle} disabled={kurBusy}
            style={{background:"none",border:"none",cursor:kurBusy?"default":"pointer",fontSize:13,padding:"0 2px",opacity:kurBusy?.4:1,transition:"opacity .2s",verticalAlign:"middle"}}
            title="Kurları güncelle">
            {kurBusy?"⏳":"🔄"}
          </button>
          {kurlar.tarih && <span style={{color:G.t3,fontSize:10,marginLeft:4}}>({kurlar.tarih})</span>}
        </p>
      </div>

      <div className="bkl-grid4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
        {cards.map((c,i)=>(
          <div key={c.l} className="bkl-card" style={{background:G.glass,backdropFilter:"blur(20px)",border:`1px solid ${G.border}`,borderRadius:18,padding:"20px 22px",boxShadow:G.shadow,animationDelay:`${i*.06}s`}}>
            <div style={{width:40,height:40,borderRadius:12,background:c.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,marginBottom:12}}>{c.i}</div>
            <div style={{fontSize:22,fontWeight:800,color:c.c,letterSpacing:-.5}}>{c.v}</div>
            <div style={{fontSize:11,color:G.t3,marginTop:4,fontWeight:500}}>{c.l}</div>
          </div>
        ))}
      </div>

      <div className="bkl-grid2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {/* Kritik stoklar */}
        <div className="bkl-card" style={{background:G.glass,backdropFilter:"blur(20px)",border:`1px solid ${G.border}`,borderRadius:18,padding:22,boxShadow:G.shadow,animationDelay:".2s"}}>
          <Row between>
            <span style={{fontWeight:700,fontSize:14}}>⚠️ Kritik Stoklar</span>
            <Lnk onClick={()=>setPage("urunler")}>Tümü →</Lnk>
          </Row>
          <div style={{marginTop:12}}>
            {kritikStoklar.length===0
              ? <Empty>✅ Kritik stok yok</Empty>
              : kritikStoklar.slice(0,6).map(u=>{
                const st=stokHesapla(u.id);
                return (
                  <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${G.border}`}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{u.ad}</div>
                      <div style={{fontSize:11,color:G.t3}}>{u.kod}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:800,fontSize:16,color:st<=0?G.red:G.orange}}>{st}</div>
                      <div style={{fontSize:10,color:G.t3}}>Min:{u.minStok}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Son hareketler — gruplu (irsaliye bazlı) */}
        <div className="bkl-card" style={{background:G.glass,backdropFilter:"blur(20px)",border:`1px solid ${G.border}`,borderRadius:18,padding:22,boxShadow:G.shadow,animationDelay:".24s"}}>
          <Row between>
            <span style={{fontWeight:700,fontSize:14}}>🔄 Son İşlemler</span>
            <Lnk onClick={()=>setPage("tum_hareketler")}>Tümü →</Lnk>
          </Row>
          <div style={{marginTop:12}}>
            {sonGruplar.length===0 ? <Empty>Henüz hareket yok</Empty>
              : sonGruplar.map((grup,gi)=>{
                const h0 = grup[0];
                const firma = [...data.musteriler,...data.tedarikciler].find(f=>f.id===h0.firmaId);
                const isMasraf = h0.tip === "masraf";
                const isIn = ["giris","alis"].includes(h0.tip);
                const kalemSayi = grup.length;
                const topMiktar = grup.reduce((s,h)=>s+sf(h.miktar),0);
                const topTutar = grup.reduce((s,h)=>s+sf(h.orijinalTutar||h.tutar),0);
                const doviz = h0.orijinalDoviz || h0.doviz || "USD";
                const tipLabel = TIP_LABEL[h0.tip] || h0.tip;
                const ikonBg = isMasraf ? G.orangeL : isIn ? G.greenL : G.redL;
                const ikon = isMasraf ? "💸" : isIn ? "↓" : "↑";
                return (
                  <div key={h0.irsaliyeNo||h0.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:gi<sonGruplar.length-1?`1px solid ${G.border}`:"none"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
                      <div style={{width:28,height:28,borderRadius:8,background:ikonBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{ikon}</div>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {isMasraf ? (h0.aciklama || h0.masrafKategori || "Masraf") : (firma?.ad||"—")}
                          {kalemSayi > 1 && <span style={{color:G.t3,fontWeight:400,marginLeft:4}}>({kalemSayi} kalem)</span>}
                        </div>
                        <div style={{fontSize:11,color:G.t3}}>
                          {h0.irsaliyeNo && <span style={{marginRight:6}}>{h0.irsaliyeNo}</span>}
                          {fmtD(h0.tarih)}
                          {isMasraf && h0.masrafKategori && h0.aciklama && <span style={{marginLeft:4}}>· {h0.masrafKategori}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <Pill color={isMasraf?"orange":isIn?"green":"red"}>{tipLabel}</Pill>
                      <div style={{fontSize:12,fontWeight:700,color:G.t1,marginTop:2}}>{fmt(topTutar)} {doviz}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── §10.6a Tüm Hareketler sayfası ───────────────────────────────────────────
function TumHareketler({ data, update, updateBatch, showToast, cariHesapla, onCariGit }) {
  const [ara,      setAra]      = useState("");
  const [tipFiltre,setTipFiltre]= useState("hepsi");
  const [firmaFiltre,setFirmaFiltre] = useState("");
  const [gorunum,  setGorunum]  = useState("gruplu"); // "gruplu" | "tekli"

  const firmalar = useMemo(()=>[...data.musteriler,...data.tedarikciler],[data.musteriler,data.tedarikciler]);

  // firmaId fallback: boşsa aynı irsaliyedeki başka hareketten bul
  const firmaBulVeGit = (h) => {
    let fId = h?.firmaId;
    if (!fId && h?.irsaliyeNo) {
      const diger = data.hareketler.find(x => x.irsaliyeNo === h.irsaliyeNo && x.firmaId);
      fId = diger?.firmaId;
    }
    if (!fId) { showToast("Bu hareket firmaya bağlı değil","warn"); return; }
    const f = firmalar.find(x => x.id === fId);
    if (!f) { showToast("Firma bulunamadı","warn"); return; }
    const t = data.musteriler.some(m => m.id === f.id) ? "musteri" : "tedarikci";
    onCariGit(f, t, h.irsaliyeNo);
  };

  const filtrelenmis = useMemo(()=>{
    let h = [...data.hareketler].sort((a,b)=>b.tarih.localeCompare(a.tarih));
    if (tipFiltre !== "hepsi") h = h.filter(x=>x.tip===tipFiltre);
    if (firmaFiltre) h = h.filter(x=>x.firmaId===firmaFiltre);
    if (ara.trim()) {
      const q = ara.trim().toLowerCase();
      h = h.filter(x=>{
        const urun  = data.urunler.find(u=>u.id===x.urunId);
        const firma = firmalar.find(f=>f.id===x.firmaId);
        return (urun?.ad||x.urunAd||"").toLowerCase().includes(q)
            || (urun?.kod||"").toLowerCase().includes(q)
            || (firma?.ad||"").toLowerCase().includes(q)
            || (x.irsaliyeNo||"").toLowerCase().includes(q);
      });
    }
    return h;
  },[data.hareketler, data.urunler, firmalar, tipFiltre, firmaFiltre, ara]);

  const tipSecenekler = [
    {k:"hepsi",l:"Tümü"},
    {k:"satis",l:"Satış"},{k:"alis",l:"Alış"},
    {k:"tahsilat",l:"Tahsilat"},{k:"odeme",l:"Ödeme"},
    {k:"giris",l:"Giriş"},{k:"cikis",l:"Çıkış"},
    {k:"masraf",l:"Masraf"},
  ];

  return (
    <div>
      <PageHeader title="📋 Tüm Hareketler" sub={`${filtrelenmis.length} hareket`} />

      {/* Filtreler */}
      <Card style={{marginBottom:14,padding:"12px 16px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {/* Arama */}
          <div style={{position:"relative",flex:"1 1 180px"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:G.t3,fontSize:13}}>🔍</span>
            <input value={ara} onChange={e=>setAra(e.target.value)}
              placeholder="Ürün, firma, irsaliye…" className="bkl-input"
              style={{paddingLeft:30,width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.8)",
                border:`1px solid ${G.border}`,borderRadius:10,padding:"7px 12px 7px 30px",fontSize:12,color:G.t1}}/>
          </div>
          {/* Tip filtre */}
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {tipSecenekler.map(t=>(
              <button key={t.k} onClick={()=>setTipFiltre(t.k)}
                style={{padding:"5px 10px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",
                  border:`1.5px solid ${tipFiltre===t.k?G.blue:G.border}`,
                  background:tipFiltre===t.k?G.blue:"transparent",
                  color:tipFiltre===t.k?"#fff":G.t2}}>
                {t.l}
              </button>
            ))}
          </div>
          {/* Firma filtre */}
          <BklSelect value={firmaFiltre} onChange={v=>setFirmaFiltre(v)}
            options={firmalar.map(f=>({value:f.id,label:f.ad}))}
            placeholder="— Tüm Firmalar —" searchable
            style={{maxWidth:200,fontSize:12}} />
          {/* Sıfırla */}
          {(ara||tipFiltre!=="hepsi"||firmaFiltre) && (
            <button onClick={()=>{setAra("");setTipFiltre("hepsi");setFirmaFiltre("");}}
              style={{padding:"5px 10px",borderRadius:20,fontSize:11,border:`1px solid ${G.border}`,
                background:G.glass,color:G.t2,cursor:"pointer",fontWeight:600}}>✕ Sıfırla</button>
          )}
          {/* Görünüm toggle */}
          <div style={{marginLeft:"auto",display:"flex",gap:0,border:`1.5px solid ${G.border}`,borderRadius:20,overflow:"hidden"}}>
            <button onClick={()=>setGorunum("gruplu")}
              style={{padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",border:"none",
                background:gorunum==="gruplu"?G.blue:"transparent",
                color:gorunum==="gruplu"?"#fff":G.t2}}>📦 Gruplu</button>
            <button onClick={()=>setGorunum("tekli")}
              style={{padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",border:"none",
                background:gorunum==="tekli"?G.blue:"transparent",
                color:gorunum==="tekli"?"#fff":G.t2}}>📋 Tekli</button>
          </div>
        </div>
      </Card>

      {filtrelenmis.length === 0
        ? <Card><div style={{padding:"36px 0",textAlign:"center",color:G.t3}}>Hareket bulunamadı</div></Card>
        : gorunum === "gruplu"
        ? <GrupluHareketler
            hareketler={filtrelenmis}
            urunler={data.urunler}
            firmalar={firmalar}
            kurlar={data.kurlar}
            onDuzenle={h => { if (h?.tip === "masraf") return; firmaBulVeGit(h); }}
            onSil={ids=>{
              updateBatch({hareketler: data.hareketler.filter(h=>!(Array.isArray(ids)?ids:[ids]).includes(h.id))});
              showToast("Silindi");
            }}
            onDuzenleGrup={(items)=>{
              if (!items?.length) return;
              firmaBulVeGit(items[0]);
            }}
            onUpdate={guncelH=>{
              update("hareketler", data.hareketler.map(h=>h.id===guncelH.id ? guncelH : h));
              showToast("Güncellendi ✅");
            }}
          />
        : /* Tekli görünüm */
          <Card noPad>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:G.tableTh}}>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:G.t3}}>TARİH</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:G.t3}}>TİP</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:G.t3}}>ÜRÜN</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:G.t3}}>FİRMA</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontSize:11,fontWeight:700,color:G.t3}}>MİKTAR</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontSize:11,fontWeight:700,color:G.t3}}>TUTAR</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:G.t3}}>İRSALİYE</th>
              </tr></thead>
              <tbody>
                {filtrelenmis.map(h => {
                  const urun = data.urunler.find(u=>u.id===h.urunId);
                  const firma = firmalar.find(f=>f.id===h.firmaId);
                  const isIn = ["giris","alis"].includes(h.tip);
                  const isMasraf = h.tip === "masraf";
                  return (
                    <tr key={h.id} className={isMasraf?"":"bkl-row"}
                      style={{borderBottom:`1px solid ${G.border}`,cursor:isMasraf?"default":"pointer"}}
                      onClick={()=>{ if (!isMasraf) firmaBulVeGit(h); }}>
                      <TD>{fmtD(h.tarih)}</TD>
                      <TD><Pill color={isIn?"green":"red"}>{TIP_LABEL[h.tip]||h.tip}</Pill></TD>
                      <TD>
                        <div style={{fontWeight:600}}>{urun?.ad||h.urunAd||"—"}</div>
                        {urun?.kod && <div style={{fontSize:10,color:G.t3}}>{urun.kod}</div>}
                      </TD>
                      <TD>{firma?.ad||"—"}</TD>
                      <TD style={{textAlign:"right",fontWeight:600}}>{h.miktar}</TD>
                      <TD style={{textAlign:"right"}}>
                        <span style={{fontWeight:600}}>{fmt(h.orijinalTutar||h.tutar)}</span>
                        <span style={{fontSize:10,color:G.t3,marginLeft:3}}>{h.orijinalDoviz||h.doviz||"USD"}</span>
                      </TD>
                      <TD><span style={{fontSize:11,color:G.t3}}>{h.irsaliyeNo||"—"}</span></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
      }
    </div>
  );
}


// ── §10.7 Müşteriler & Tedarikçiler ─────────────────────────────────────────
function Firmalar({ data, update, showToast, tip, cariHesapla, onCariAc }) {
  const [ara, setAra] = useState("");
  const [form, setForm] = useState(null);
  const liste = tip==="musteri" ? data.musteriler : data.tedarikciler;
  const setL = v => update(tip==="musteri"?"musteriler":"tedarikciler",v);
  const filtered = liste.filter(f=>(f.ad+(f.vergiNo||"")+(f.ulke||"")).toLowerCase().includes(ara.toLowerCase()));
  const isMus = tip==="musteri";
  const { sorted:sortedFirma, sortCol, sortDir, sort } = useSortable(filtered, "ad");

  const [silOnayId, setSilOnayId] = useState(null);
  const kaydet = f => { if(!f.ad){showToast("Ad zorunlu","warn");return;} setL(f.id?liste.map(x=>x.id===f.id?f:x):[...liste,{...f,id:uid()}]); showToast(f.id?"Güncellendi":"Eklendi ✅"); setForm(null); };
  const sil = id => setSilOnayId(id === silOnayId ? null : id);
  const silOnayla = id => {
    const hareketi = data.hareketler.some(h => h.firmaId === id);
    if (hareketi) { showToast("Bu firmanın hareketleri var — silinemez. Önce cari ekstreden hareketleri silin.","warn"); setSilOnayId(null); return; }
    setL(liste.filter(f=>f.id!==id)); showToast("Silindi"); setSilOnayId(null);
  };
  const yeni= ()=>setForm({ad:"",vergiNo:"",telefon:"",email:"",ulke:"",sehir:"",paraBirimi:"USD",notlar:""});

  return (
    <div>
      <PageHeader title={isMus?"🏢 Müşteriler":"🚚 Tedarikçiler"} sub={`${liste.length} kayıt`}>
        <SearchBar value={ara} onChange={setAra} />
        <Btn primary onClick={yeni}>+ {isMus?"Müşteri":"Tedarikçi"} Ekle</Btn>
      </PageHeader>
      {form && (
        <Card style={{marginBottom:18}}>
          <Row between style={{marginBottom:16}}>
            <span style={{fontWeight:700,fontSize:15}}>{form.id?"Düzenle":`Yeni ${isMus?"Müşteri":"Tedarikçi"}`}</span>
            <Row gap={8}><Btn primary onClick={()=>kaydet(form)}>💾 Kaydet</Btn><Btn secondary onClick={()=>setForm(null)}>İptal</Btn></Row>
          </Row>
          <Grid2>
            <F l="Firma Adı *" v={form.ad} s={v=>setForm({...form,ad:v})} />
            <F l="Vergi No / VKN" v={form.vergiNo} s={v=>setForm({...form,vergiNo:v})} />
            <F l="Telefon" v={form.telefon} s={v=>setForm({...form,telefon:v})} />
            <F l="E-posta" v={form.email} s={v=>setForm({...form,email:v})} />
            <F l="Ülke" v={form.ulke} s={v=>setForm({...form,ulke:v})} />
            <F l="Şehir" v={form.sehir} s={v=>setForm({...form,sehir:v})} />
            <FS l="Para Birimi" v={form.paraBirimi} s={v=>setForm({...form,paraBirimi:v})} o={["TL","USD","EUR"]} />
            <F l="Notlar" v={form.notlar} s={v=>setForm({...form,notlar:v})} />
          </Grid2>
        </Card>
      )}

      {/* ── Mobil kart görünümü (dikey) ── */}
      <div className="bkl-firma-cards">
        {sortedFirma.length === 0
          ? <div style={{padding:"32px 0",textAlign:"center",color:G.t3}}>{ara?"Sonuç yok":`${isMus?"Müşteri":"Tedarikçi"} eklenmedi`}</div>
          : sortedFirma.map(f => {
              const cari = cariHesapla(f.id, tip);
              const bizAlacakli = isMus ? cari>0 : cari<0;
              const cariRenk = cari===0?G.t3:bizAlacakli?G.green:G.red;
              const cariLabel = cari===0?"Sıfır":bizAlacakli?"Alacak":"Borç";
              return (
                <div key={f.id} onClick={()=>onCariAc(f)}
                  style={{marginBottom:8,borderRadius:14,background:G.glass,border:`1px solid ${G.border}`,
                    padding:"12px 14px",cursor:"pointer",boxShadow:G.shadowSm,display:"flex",alignItems:"center",gap:12}}>
                  {/* Sol: avatar harf */}
                  <div style={{width:42,height:42,borderRadius:12,background:isMus?G.blueL:G.tealL,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:16,fontWeight:800,color:isMus?G.blue:G.teal,flexShrink:0}}>
                    {f.ad.charAt(0).toUpperCase()}
                  </div>
                  {/* Orta: firma bilgisi */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:G.t1,marginBottom:2,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.ad}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      {f.vergiNo&&<span style={{fontSize:10,color:G.t3}}>VKN: {f.vergiNo}</span>}
                      {(f.ulke||f.sehir)&&<span style={{fontSize:10,color:G.t3}}>📍 {[f.sehir,f.ulke].filter(Boolean).join(", ")}</span>}
                      {f.telefon&&<span style={{fontSize:10,color:G.t3}}>📞 {f.telefon}</span>}
                    </div>
                  </div>
                  {/* Sağ: bakiye + aksiyonlar */}
                  <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <div>
                      <div style={{fontSize:15,fontWeight:800,color:cariRenk,lineHeight:1}}>{fmt(Math.abs(cari))} $</div>
                      <div style={{fontSize:10,color:G.t3,marginTop:1}}>{cariLabel}</div>
                    </div>
                    <div style={{display:"flex",gap:5,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>setForm({...f})} style={{padding:"4px 10px",fontSize:11,borderRadius:20,border:`1px solid ${G.border}`,background:G.glass,color:G.t2,cursor:"pointer",fontWeight:600}}>✏️</button>
                      {silOnayId===f.id ? (
                        <>
                          <button onClick={()=>silOnayla(f.id)} style={{padding:"4px 10px",fontSize:11,borderRadius:20,border:`1.5px solid ${G.red}`,background:G.red,color:"#fff",cursor:"pointer",fontWeight:700}}>Sil</button>
                          <button onClick={()=>setSilOnayId(null)} style={{padding:"4px 10px",fontSize:11,borderRadius:20,border:`1px solid ${G.border}`,background:G.glass,color:G.t2,cursor:"pointer"}}>Vazgeç</button>
                        </>
                      ) : (
                        <button onClick={()=>sil(f.id)} style={{padding:"4px 10px",fontSize:11,borderRadius:20,border:`1.5px solid ${G.red}`,background:G.redL,color:G.red,cursor:"pointer",fontWeight:600}}>🗑️</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* ── Masaüstü / yatay tablo ── */}
      <Card noPad className="bkl-firma-table">
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:G.tableTh}}>
            <SortTh col="ad"         label="Firma Adı"     sortCol={sortCol} sortDir={sortDir} onSort={sort} />
            <SortTh col="ulke"       label="Ülke / Şehir"  sortCol={sortCol} sortDir={sortDir} onSort={sort} />
            <th className="bkl-firma-col-contact" style={{padding:"12px 16px",fontSize:11,fontWeight:700,color:G.t3,borderBottom:`1px solid ${G.border}`,letterSpacing:.5,textTransform:"uppercase"}}>İletişim</th>
            <SortTh col="paraBirimi" label="Para Birimi"   sortCol={sortCol} sortDir={sortDir} onSort={sort} className="bkl-firma-col-pb" />
            <SortTh col="_cari"      label="Cari Bakiye"   sortCol={sortCol} sortDir={sortDir} onSort={sort} />
            <th style={{padding:"12px 16px",borderBottom:`1px solid ${G.border}`}}></th>
          </tr></thead>
          <tbody>
            {sortedFirma.length===0
              ? <tr><td colSpan={6} style={{padding:"36px 0",textAlign:"center",color:G.t3}}>{ara?"Sonuç yok":`${isMus?"Müşteri":"Tedarikçi"} eklenmedi`}</td></tr>
              : sortedFirma.map(f=>{
                const cari=cariHesapla(f.id,tip);
                return (
                  <tr key={f.id} className="bkl-row" style={{borderBottom:`1px solid ${G.border}`}}>
                    <TD onClick={()=>onCariAc(f)}>
                      <b style={{color:G.blue,cursor:"pointer"}}>{f.ad}</b>
                      {f.vergiNo&&<div style={{fontSize:11,color:G.t3}}>VKN: {f.vergiNo}</div>}
                    </TD>
                    <TD>{f.ulke||"—"}{f.sehir?` / ${f.sehir}`:""}</TD>
                    <TD className="bkl-firma-col-contact"><div>{f.telefon||"—"}</div><div style={{fontSize:11,color:G.t3}}>{f.email}</div></TD>
                    <TD className="bkl-firma-col-pb"><Pill color="blue">{f.paraBirimi||"USD"}</Pill></TD>
                    <TD>
                      {(()=>{const ba=isMus?cari>0:cari<0; return <>
                      <b style={{fontSize:15,color:cari===0?G.t3:ba?G.green:G.red}}>{fmt(Math.abs(cari))} $</b>
                      <div style={{fontSize:11,color:G.t3}}>{cari===0?"Sıfır":ba?"Alacak":"Borç"}</div>
                      </>})()}
                    </TD>
                    <TD><Row gap={5}>
                      <Btn small onClick={()=>setForm({...f})}>✏️</Btn>
                      {silOnayId===f.id ? (
                        <>
                          <Btn small danger onClick={()=>silOnayla(f.id)} style={{background:G.red,color:"#fff"}}>Sil</Btn>
                          <Btn small onClick={()=>setSilOnayId(null)}>Vazgeç</Btn>
                        </>
                      ) : (
                        <Btn small danger onClick={()=>sil(f.id)}>🗑️</Btn>
                      )}
                    </Row></TD>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

