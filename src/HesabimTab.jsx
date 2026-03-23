// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal HesabımTab (v3-P2.1)
// Kompakt bakiye · FIFO açık faturalar · Bildirimler · Ödemeler · Sık alınanlar
// ══════════════════════════════════════════════════════════════════════
import React, { useState, useCallback } from "react";

const API = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SIP_API) || '/api/siparis';

// ── Yardımcılar ──────────────────────────────────────
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d) => d ? new Date(d).toLocaleDateString("tr-TR") : "—";
const gecikmeRenk = (gun) => {
  if (!gun && gun !== 0) return "";
  if (gun >= 30) return "sip-h-gecikme-kritik";
  if (gun >= 7)  return "sip-h-gecikme-uyari";
  return "";
};
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
  const [altSekme, setAltSekme] = useState("bildirimler");

  const bildirimOkundu = useCallback(async (ids) => {
    if (!pin || !ids?.length) return;
    try {
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Siparis-PIN": pin },
        body: JSON.stringify({ islem: "bildirim_okundu", bildirimIds: ids }),
      });
      if (onRefresh) onRefresh();
    } catch (e) { console.warn("Bildirim okundu hatası:", e.message); }
  }, [pin, onRefresh]);

  const tumunuOkundu = useCallback(() => {
    const okunmamis = (hesap?.bildirimler || []).filter(b => !b.okundu).map(b => b.id);
    if (okunmamis.length > 0) bildirimOkundu(okunmamis);
  }, [hesap, bildirimOkundu]);

  if (!hesap || !hesap.bakiye) {
    return (
      <div className="sip-hesabim-tab">
        <div className="sip-empty">{t.hesap_bos || "Hesap bilgisi henüz oluşturulmadı."}</div>
      </div>
    );
  }

  const { bakiye, acikFaturalar = [], sonOdemeler = [], sikAlinanlar = [], bildirimler = [], kapananFaturalar = [], bekleyenIadeler = [] } = hesap;
  const okunmamisSayisi = bildirimler.filter(b => !b.okundu).length;
  const acikToplam = acikFaturalar.reduce((s, f) => s + (f.kalan || 0), 0);

  return (
    <div className="sip-hesabim-tab">
      {/* ── Kompakt Bakiye Bar ── */}
      <div className="sip-h-bakiye-bar">
        <div className="sip-h-bakiye-sol">
          <span className="sip-h-bakiye-etiket">{t.bakiye || "Bakiye"}</span>
          <span className={`sip-h-bakiye-tutar ${bakiye.net > 0.01 ? "borc" : bakiye.net < -0.01 ? "alacak" : "sifir"}`}>
            ${fmt(Math.abs(bakiye.net))}
          </span>
          <span className="sip-h-bakiye-durum">
            {bakiye.net > 0.01 ? (t.borc_durumu || "Borçlu") : bakiye.net < -0.01 ? (t.alacak_durumu || "Alacaklı") : ""}
          </span>
        </div>
        <div className="sip-h-bakiye-sag">
          <span className="sip-h-bakiye-mini">{t.toplam_borc || "Borç"}: ${fmt(bakiye.toplamBorc)}</span>
          <span className="sip-h-bakiye-mini">{t.toplam_alacak || "Alacak"}: ${fmt(bakiye.toplamAlacak)}</span>
        </div>
      </div>

      {/* ── Açık Faturalar (FIFO — her zaman görünür) ── */}
      <div className="sip-h-section">
        <div className="sip-h-section-header">
          <span>{t.acik_fatura || "Açık Faturalar"}</span>
          {acikFaturalar.length > 0 && (
            <span className="sip-h-section-ozet">
              {acikFaturalar.length} {t.fatura_kisa || "fatura"} · ${fmt(acikToplam)}
            </span>
          )}
        </div>
        {acikFaturalar.length === 0 ? (
          <div className="sip-h-bos-mini">{t.fatura_yok || "Açık fatura yok"}</div>
        ) : (
          <div className="sip-h-fatura-list">
            {acikFaturalar.map((f, i) => (
              <div key={f.no || i} className={`sip-h-fatura-card ${gecikmeRenk(f.gecikmeGun) ? "gecikme" : ""}`}
                   onClick={() => setAcikFaturaIdx(acikFaturaIdx === i ? null : i)}>
                <div className="sip-h-fatura-row">
                  <div className="sip-h-fatura-sol">
                    <span className="sip-h-fatura-no">{f.no || "—"}</span>
                    <span className="sip-h-fatura-tarih">{fmtD(f.tarih)}</span>
                    {f.gecikmeGun > 0 && (
                      <span className={`sip-h-gecikme-badge ${gecikmeRenk(f.gecikmeGun)}`}>
                        {f.gecikmeGun} {t.gun || "gün"}
                      </span>
                    )}
                  </div>
                  <div className="sip-h-fatura-sag">
                    <div className={`sip-h-fatura-kalan ${gecikmeRenk(f.gecikmeGun)}`}>
                      ${fmt(f.kalan)}
                    </div>
                    <div className="sip-h-fatura-progress">
                      <div className="sip-h-fatura-progress-fill"
                           style={{ width: `${f.tutar > 0 ? Math.min(100, ((f.odenen || 0) / f.tutar) * 100) : 0}%` }} />
                    </div>
                  </div>
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
            ))}
          </div>
        )}
      </div>

      {/* ── Bekleyen İadeler (mahsuplaştırılmamış) ── */}
      {bekleyenIadeler.length > 0 && (
        <div className="sip-h-section">
          <div className="sip-h-section-header">
            <span>{t.iade_alacak || "İade Alacakları"}</span>
            <span className="sip-h-section-ozet">
              {bekleyenIadeler.length} {t.iade_kisa || "iade"} · ${fmt(bekleyenIadeler.reduce((s, f) => s + (f.tutar || 0), 0))}
            </span>
          </div>
          <div className="sip-h-fatura-list">
            {bekleyenIadeler.map((f, i) => (
              <div key={f.no || i} className="sip-h-fatura-card sip-h-iade-card">
                <div className="sip-h-fatura-row">
                  <div className="sip-h-fatura-sol">
                    <span className="sip-h-iade-badge">{t.iade || "İade"}</span>
                    <span className="sip-h-fatura-no">{f.no || "—"}</span>
                    <span className="sip-h-fatura-tarih">{fmtD(f.tarih)}</span>
                  </div>
                  <div className="sip-h-fatura-sag">
                    <div className="sip-h-iade-tutar">-${fmt(f.tutar)}</div>
                  </div>
                </div>
                {f.aciklama && <div className="sip-h-iade-aciklama">{f.aciklama}</div>}
                {Array.isArray(f.kalemler) && f.kalemler.length > 0 && (
                  <div className="sip-h-kalem-list" style={{ marginTop: 4 }}>
                    {f.kalemler.map((k, ki) => (
                      <div key={ki} className="sip-h-kalem-row">
                        <span className="sip-h-kalem-ad">{k.urunAd || k.urunKod}</span>
                        <span className="sip-h-kalem-adet">{k.adet}x</span>
                        <span className="sip-h-kalem-toplam">-${fmt(k.toplam)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alt Sekmeler (bildirimler / ödemeler / sık alınanlar) ── */}
      <div className="sip-h-alt-sekmeler">
        <button className={`sip-h-alt-btn ${altSekme === "bildirimler" ? "active" : ""}`} onClick={() => setAltSekme("bildirimler")}>
          {t.bildirimler || "Bildirimler"}
          {okunmamisSayisi > 0 && <span className="sip-h-count">{okunmamisSayisi}</span>}
        </button>
        <button className={`sip-h-alt-btn ${altSekme === "odemeler" ? "active" : ""}`} onClick={() => setAltSekme("odemeler")}>
          {t.odemeler || "Ödemeler"}
        </button>
        {sikAlinanlar.length > 0 && (
          <button className={`sip-h-alt-btn ${altSekme === "sik" ? "active" : ""}`} onClick={() => setAltSekme("sik")}>
            {t.sik_alinanlar || "Sık Alınanlar"}
          </button>
        )}
      </div>

      {/* ── Bildirimler ── */}
      {altSekme === "bildirimler" && (
        <div className="sip-h-bildirim-section">
          {bildirimler.length === 0 ? (
            <div className="sip-h-bos-mini">{t.bildirim_yok || "Bildirim yok"}</div>
          ) : (
            <>
              {okunmamisSayisi > 0 && (
                <div className="sip-h-bildirim-actions">
                  <button className="sip-h-link-btn" onClick={tumunuOkundu}>
                    {t.tumunu_oku || "Tümünü okundu yap"}
                  </button>
                </div>
              )}
              <div className="sip-h-bildirim-list">
                {bildirimler.slice().reverse().slice(0, 15).map(b => (
                  <div key={b.id} className={`sip-h-bildirim ${b.okundu ? "okundu" : "yeni"}`}
                       onClick={() => !b.okundu && bildirimOkundu([b.id])}>
                    <span className="sip-h-bildirim-ikon">{bildirimIkon(b.tip)}</span>
                    <span className="sip-h-bildirim-mesaj">{b.mesaj}</span>
                    <span className="sip-h-bildirim-tarih">{fmtD(b.tarih)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Ödemeler ── */}
      {altSekme === "odemeler" && (
        <div className="sip-h-odemeler">
          {sonOdemeler.length === 0 ? (
            <div className="sip-h-bos-mini">{t.odeme_yok || "Ödeme geçmişi yok"}</div>
          ) : (
            sonOdemeler.slice().reverse().map((o, i) => (
              <div key={i} className={`sip-h-odeme-row ${o.tip === "mahsup" ? "sip-h-mahsup" : ""}`}>
                <div className="sip-h-odeme-sol">
                  <div className="sip-h-odeme-tarih">
                    {fmtD(o.tarih)}
                    {o.tip === "mahsup" && <span className="sip-h-mahsup-badge">{t.mahsup || "Mahsup"}</span>}
                  </div>
                  <div className="sip-h-odeme-yontem">{o.yontem || "—"}</div>
                  {/* FIFO eşleşme detayı */}
                  {Array.isArray(o.eslesmeler) && o.eslesmeler.length > 0 && (
                    <div className="sip-h-odeme-eslesmeler">
                      {o.eslesmeler.map((e, ei) => (
                        <span key={ei} className="sip-h-esleme">
                          {e.faturaNo}: ${fmt(e.kapatilan)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={`sip-h-odeme-tutar ${o.tip === "mahsup" ? "mahsup" : ""}`}>
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

      {/* ── Sık Alınanlar ── */}
      {altSekme === "sik" && sikAlinanlar.length > 0 && (
        <div className="sip-h-chip-list">
          {sikAlinanlar.slice(0, 20).map(kod => (
            <button key={kod} className="sip-h-chip" onClick={() => onSiparisSec && onSiparisSec(kod)}>
              {kod}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
