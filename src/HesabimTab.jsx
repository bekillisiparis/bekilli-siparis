// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal HesabımTab (v3-P2)
// Bakiye kartı · Bildirimler · Açık faturalar · Son ödemeler · Sık alınanlar
// ══════════════════════════════════════════════════════════════════════
import React, { useState, useMemo, useCallback } from "react";

const API = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SIP_API) || '/api/siparis';

// ── Yardımcılar ──────────────────────────────────────
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d) => d ? new Date(d).toLocaleDateString("tr-TR") : "—";
const gecikmeRenk = (gun) => {
  if (!gun && gun !== 0) return "";
  if (gun >= 30) return "sip-h-gecikme-kritik";   // kırmızı
  if (gun >= 7)  return "sip-h-gecikme-uyari";    // turuncu
  return "";
};

// ── Bildirim ikonu ───────────────────────────────────
const bildirimIkon = (tip) => {
  if (tip === "fatura_kesildi") return "📄";
  if (tip === "tahsilat_alindi") return "💰";
  if (tip === "iade_yapildi") return "↩️";
  return "🔔";
};

// ══════════════════════════════════════════════════════
// HesabimTab
// ══════════════════════════════════════════════════════
export default function HesabimTab({ t, hesap, pin, onSiparisSec, onRefresh }) {
  const [acikFaturaIdx, setAcikFaturaIdx] = useState(null);
  const [sekme, setSekme] = useState("genel"); // genel | faturalar | odemeler

  // Bildirim okundu gönder
  const bildirimOkundu = useCallback(async (ids) => {
    if (!pin || !ids?.length) return;
    try {
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Siparis-PIN": pin },
        body: JSON.stringify({ islem: "bildirim_okundu", bildirimIds: ids }),
      });
      if (onRefresh) onRefresh(); // veriyi yenile
    } catch (e) { console.warn("Bildirim okundu hatası:", e.message); }
  }, [pin, onRefresh]);

  // Tümünü okundu yap
  const tumunuOkundu = useCallback(() => {
    const okunmamis = (hesap?.bildirimler || []).filter(b => !b.okundu).map(b => b.id);
    if (okunmamis.length > 0) bildirimOkundu(okunmamis);
  }, [hesap, bildirimOkundu]);

  // Hesap verisi yoksa
  if (!hesap || !hesap.bakiye) {
    return (
      <div className="sip-hesabim-tab">
        <div className="sip-empty">{t.hesap_bos || "Hesap bilgisi henüz oluşturulmadı."}</div>
      </div>
    );
  }

  const { bakiye, acikFaturalar = [], sonOdemeler = [], sikAlinanlar = [], bildirimler = [], kapananFaturalar = [] } = hesap;
  const okunmamisSayisi = bildirimler.filter(b => !b.okundu).length;

  return (
    <div className="sip-hesabim-tab">
      {/* ── Bakiye Kartı ── */}
      <div className="sip-h-bakiye-card">
        <div className="sip-h-bakiye-label">{t.bakiye || "Bakiye"}</div>
        <div className={`sip-h-bakiye-val ${bakiye.net > 0.01 ? "borc" : bakiye.net < -0.01 ? "alacak" : "sifir"}`}>
          ${fmt(Math.abs(bakiye.net))}
        </div>
        <div className="sip-h-bakiye-alt">
          {bakiye.net > 0.01
            ? (t.borc_durumu || "Borçlu")
            : bakiye.net < -0.01
              ? (t.alacak_durumu || "Alacaklı")
              : (t.bakiye_sifir || "Bakiye sıfır")}
        </div>
        <div className="sip-h-bakiye-detay">
          <span>{t.toplam_borc || "Borç"}: <b>${fmt(bakiye.toplamBorc)}</b></span>
          <span>{t.toplam_alacak || "Alacak"}: <b>${fmt(bakiye.toplamAlacak)}</b></span>
        </div>
      </div>

      {/* ── Bildirimler ── */}
      {bildirimler.length > 0 && (
        <div className="sip-h-section">
          <div className="sip-h-section-header">
            <span>{t.bildirimler || "Bildirimler"}</span>
            {okunmamisSayisi > 0 && (
              <>
                <span className="sip-badge">{okunmamisSayisi}</span>
                <button className="sip-h-link-btn" onClick={tumunuOkundu}>
                  {t.tumunu_oku || "Tümünü okundu yap"}
                </button>
              </>
            )}
          </div>
          <div className="sip-h-bildirim-list">
            {bildirimler.slice().reverse().slice(0, 10).map(b => (
              <div
                key={b.id}
                className={`sip-h-bildirim ${b.okundu ? "okundu" : "yeni"}`}
                onClick={() => !b.okundu && bildirimOkundu([b.id])}
              >
                <span className="sip-h-bildirim-ikon">{bildirimIkon(b.tip)}</span>
                <span className="sip-h-bildirim-mesaj">{b.mesaj}</span>
                <span className="sip-h-bildirim-tarih">{fmtD(b.tarih)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alt sekmeler ── */}
      <div className="sip-h-alt-sekmeler">
        <button className={`sip-h-alt-btn ${sekme === "genel" ? "active" : ""}`} onClick={() => setSekme("genel")}>
          {t.genel || "Genel"}
        </button>
        <button className={`sip-h-alt-btn ${sekme === "faturalar" ? "active" : ""}`} onClick={() => setSekme("faturalar")}>
          {t.faturalar || "Faturalar"}
          {acikFaturalar.length > 0 && <span className="sip-h-count">{acikFaturalar.length}</span>}
        </button>
        <button className={`sip-h-alt-btn ${sekme === "odemeler" ? "active" : ""}`} onClick={() => setSekme("odemeler")}>
          {t.odemeler || "Ödemeler"}
        </button>
      </div>

      {/* ── Genel Sekme ── */}
      {sekme === "genel" && (
        <div className="sip-h-genel">
          {/* Özet satırlar */}
          <div className="sip-h-ozet-grid">
            <div className="sip-h-ozet-item">
              <div className="sip-h-ozet-label">{t.acik_fatura || "Açık Fatura"}</div>
              <div className="sip-h-ozet-val">{acikFaturalar.length}</div>
            </div>
            <div className="sip-h-ozet-item">
              <div className="sip-h-ozet-label">{t.acik_toplam || "Açık Tutar"}</div>
              <div className="sip-h-ozet-val">${fmt(acikFaturalar.reduce((s, f) => s + (f.kalan || 0), 0))}</div>
            </div>
            <div className="sip-h-ozet-item">
              <div className="sip-h-ozet-label">{t.son_odeme_tarihi || "Son Ödeme"}</div>
              <div className="sip-h-ozet-val">{sonOdemeler[0] ? fmtD(sonOdemeler[0].tarih) : "—"}</div>
            </div>
          </div>

          {/* Sık alınanlar */}
          {sikAlinanlar.length > 0 && (
            <div className="sip-h-section">
              <div className="sip-h-section-header">
                <span>{t.sik_alinanlar || "Sık Alınanlar"}</span>
              </div>
              <div className="sip-h-chip-list">
                {sikAlinanlar.slice(0, 12).map(kod => (
                  <button key={kod} className="sip-h-chip" onClick={() => onSiparisSec && onSiparisSec(kod)}>
                    {kod}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Faturalar Sekme ── */}
      {sekme === "faturalar" && (
        <div className="sip-h-faturalar">
          {acikFaturalar.length === 0 ? (
            <div className="sip-empty" style={{ padding: "20px" }}>{t.fatura_yok || "Açık fatura yok"}</div>
          ) : (
            acikFaturalar.map((f, i) => (
              <div key={f.no || i} className="sip-h-fatura-card" onClick={() => setAcikFaturaIdx(acikFaturaIdx === i ? null : i)}>
                <div className="sip-h-fatura-row">
                  <div className="sip-h-fatura-sol">
                    <div className="sip-h-fatura-no">{f.no || "—"}</div>
                    <div className="sip-h-fatura-tarih">{fmtD(f.tarih)}</div>
                  </div>
                  <div className="sip-h-fatura-sag">
                    <div className={`sip-h-fatura-kalan ${gecikmeRenk(f.gecikmeGun)}`}>
                      ${fmt(f.kalan)}
                    </div>
                    {f.gecikmeGun >= 7 && (
                      <div className={`sip-h-gecikme-badge ${gecikmeRenk(f.gecikmeGun)}`}>
                        {f.gecikmeGun} {t.gun || "gün"}
                      </div>
                    )}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="sip-h-fatura-progress">
                  <div
                    className="sip-h-fatura-progress-fill"
                    style={{ width: `${f.tutar > 0 ? Math.min(100, ((f.odenen || 0) / f.tutar) * 100) : 0}%` }}
                  />
                </div>
                {/* Fatura detay (accordion) */}
                {acikFaturaIdx === i && (
                  <div className="sip-h-fatura-detay">
                    <div className="sip-h-fatura-meta">
                      <span>{t.toplam || "Toplam"}: ${fmt(f.tutar)}</span>
                      <span>{t.odenen || "Ödenen"}: ${fmt(f.odenen || 0)}</span>
                      {f.orijinalDoviz && f.orijinalDoviz !== "USD" && (
                        <span>{f.orijinalDoviz}: {fmt(f.orijinalTutar)}</span>
                      )}
                      {f.kdvOrani > 0 && <span>KDV %{f.kdvOrani}: ${fmt(f.kdvTutar)}</span>}
                    </div>
                    {Array.isArray(f.kalemler) && f.kalemler.length > 0 && (
                      <div className="sip-h-kalem-list">
                        {f.kalemler.map((k, ki) => (
                          <div key={ki} className="sip-h-kalem-row">
                            <span className="sip-h-kalem-ad">{k.urunAd || k.urunKod}</span>
                            <span className="sip-h-kalem-adet">{k.adet}x</span>
                            <span className="sip-h-kalem-fiyat">${fmt(k.birimFiyat)}</span>
                            <span className="sip-h-kalem-toplam">${fmt(k.toplam)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Kapanan faturalar (mini özet) */}
          {kapananFaturalar.length > 0 && (
            <div className="sip-h-section" style={{ marginTop: 12 }}>
              <div className="sip-h-section-header">
                <span>{t.kapanan_faturalar || "Kapanan Faturalar"} ({kapananFaturalar.length})</span>
              </div>
              <div className="sip-h-kapanan-list">
                {kapananFaturalar.slice(-5).reverse().map((f, i) => (
                  <div key={i} className="sip-h-kapanan-row">
                    <span>{f.no || "—"}</span>
                    <span>{fmtD(f.tarih)}</span>
                    <span>${fmt(f.tutar)}</span>
                    <span className="sip-h-kapanan-ok">✓</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ödemeler Sekme ── */}
      {sekme === "odemeler" && (
        <div className="sip-h-odemeler">
          {sonOdemeler.length === 0 ? (
            <div className="sip-empty" style={{ padding: "20px" }}>{t.odeme_yok || "Ödeme geçmişi yok"}</div>
          ) : (
            sonOdemeler.map((o, i) => (
              <div key={i} className="sip-h-odeme-row">
                <div className="sip-h-odeme-sol">
                  <div className="sip-h-odeme-tarih">{fmtD(o.tarih)}</div>
                  <div className="sip-h-odeme-yontem">{o.yontem || "—"}</div>
                </div>
                <div className="sip-h-odeme-tutar">
                  ${fmt(o.tutar)}
                  {o.orijinalTutar && o.doviz !== "USD" && (
                    <span className="sip-h-odeme-doviz"> ({fmt(o.orijinalTutar)} {o.doviz})</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
