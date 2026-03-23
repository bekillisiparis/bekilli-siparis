// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal v4.1: HesabimPage
// 2 panel: Bakiye + Faturalar (sol 58%) + Dashboard Aktivite (sağ 42%)
// Sağ panel: özet kartlar (5 bildirim + 5 ödeme) → tıklayınca tam geçmiş
// ══════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react';

const API = '/api/siparis';
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';
const fmtDLong = (d) => d ? new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

// ── HesabimPage ─────────────────────────────────────
export default function HesabimPage({ t, hesap, pin, onRefresh, fiyatlar, katalog }) {
  const [faturaTab, setFaturaTab] = useState('acik');
  const [openFaturaId, setOpenFaturaId] = useState(null);
  // Sağ panel: 'dashboard' | 'bildirimler' | 'odemeler'
  const [rightView, setRightView] = useState('dashboard');
  // Ekstre dönem
  const [ekstreBaslangic, setEkstreBaslangic] = useState('');
  const [ekstreBitis, setEkstreBitis] = useState('');

  // Bildirim okundu
  const bildirimOkundu = useCallback(async (ids) => {
    if (!pin || !ids?.length) return;
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Siparis-PIN': pin },
        body: JSON.stringify({ islem: 'bildirim_okundu', bildirimIds: ids }),
      });
      if (onRefresh) onRefresh();
    } catch (e) { console.warn('Bildirim okundu hatası:', e.message); }
  }, [pin, onRefresh]);

  const tumunuOkundu = useCallback(() => {
    const okunmamis = (hesap?.bildirimler || []).filter(b => !b.okundu).map(b => b.id);
    if (okunmamis.length > 0) bildirimOkundu(okunmamis);
  }, [hesap, bildirimOkundu]);

  if (!hesap || !hesap.bakiye) {
    return (
      <div className="sip-2panel">
        <div className="sip-panel"><div className="sip-empty">{t.hesap_bos}</div></div>
        <div className="sip-panel" />
      </div>
    );
  }

  const { bakiye, acikFaturalar = [], sonOdemeler = [], sikAlinanlar = [], bildirimler = [], kapananFaturalar = [], bekleyenIadeler = [] } = hesap;
  const okunmamisSayisi = bildirimler.filter(b => !b.okundu).length;
  const acikToplam = acikFaturalar.reduce((s, f) => s + (f.kalan || 0), 0);
  const tlKur = hesap.kurlar?.USDTRY || hesap.kurlar?.usdTry || 0;

  return (
    <div className="sip-2panel">
      {/* ══ SOL PANEL: Bakiye + Faturalar ══ */}
      <div className="sip-panel">
        {/* ── Bakiye Kartı ── */}
        <div className="sip-bakiye">
          <div className="sip-bakiye-label">{t.bakiye}</div>
          <div className={`sip-bakiye-net ${bakiye.net > 0.01 ? 'borc' : bakiye.net < -0.01 ? 'alacak' : 'sifir'}`}>
            ${fmt(Math.abs(bakiye.net))}
          </div>
          {tlKur > 0 ? (
            <div className="sip-bakiye-doviz">
              ≈ ₺{fmt(Math.abs(bakiye.net) * tlKur, 0)} <span style={{ fontSize: 9, opacity: 0.6 }}>($1 = ₺{fmt(tlKur, 2)})</span>
            </div>
          ) : (
            <div className="sip-bakiye-doviz">
              {bakiye.net > 0.01 ? t.borc_durumu : bakiye.net < -0.01 ? t.alacak_durumu : ''}
            </div>
          )}
          <div className="sip-bakiye-row">
            <span>{t.toplam_borc}: ${fmt(bakiye.toplamBorc)}</span>
            <span>{t.toplam_alacak}: ${fmt(bakiye.toplamAlacak)}</span>
          </div>
          {bakiye.toplamBorc > 0 && (
            <>
              <div className="sip-bakiye-bar">
                <div className="sip-bakiye-bar-fill" style={{ width: `${Math.min(100, ((bakiye.toplamAlacak || 0) / bakiye.toplamBorc) * 100)}%` }} />
              </div>
              <div className="sip-bakiye-pct">%{Math.round(((bakiye.toplamAlacak || 0) / bakiye.toplamBorc) * 100)} ödendi</div>
            </>
          )}
        </div>

        {/* ── Fatura Sub-Tabs ── */}
        <div className="sip-subtabs">
          <button className={`sip-subtab ${faturaTab === 'acik' ? 'active' : ''}`} onClick={() => setFaturaTab('acik')}>
            {t.acik_fatura}{acikFaturalar.length > 0 && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>({acikFaturalar.length})</span>}
          </button>
          {kapananFaturalar.length > 0 && (
            <button className={`sip-subtab ${faturaTab === 'kapanan' ? 'active' : ''}`} onClick={() => setFaturaTab('kapanan')}>Kapanan ({kapananFaturalar.length})</button>
          )}
          {bekleyenIadeler.length > 0 && (
            <button className={`sip-subtab ${faturaTab === 'iade' ? 'active' : ''}`} onClick={() => setFaturaTab('iade')}>{t.iade} ({bekleyenIadeler.length})</button>
          )}
        </div>

        {/* ── Açık Faturalar ── */}
        {faturaTab === 'acik' && (
          <>
            {acikFaturalar.length > 0 && (
              <div className="sip-section-title">
                <span>{acikFaturalar.length} {t.fatura_kisa}</span>
                <span className="sip-section-sum">${fmt(acikToplam)}{tlKur > 0 && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>≈₺{fmt(acikToplam * tlKur, 0)}</span>}</span>
              </div>
            )}
            {acikFaturalar.length === 0 ? <div className="sip-empty">{t.fatura_yok}</div> : (
              acikFaturalar.map((f, i) => (
                <FaturaCard key={f.no || i} f={f} t={t} tlKur={tlKur}
                  isOpen={openFaturaId === `a${i}`} onToggle={() => setOpenFaturaId(openFaturaId === `a${i}` ? null : `a${i}`)} />
              ))
            )}
          </>
        )}

        {/* ── Kapanan Faturalar (detay + PDF/Excel) ── */}
        {faturaTab === 'kapanan' && (
          kapananFaturalar.length === 0 ? <div className="sip-empty">Kapanan fatura yok</div> : (
            kapananFaturalar.map((f, i) => (
              <FaturaCard key={f.no || i} f={{ ...f, kalan: 0, odenen: f.tutar }} t={t} tlKur={tlKur} kapali
                isOpen={openFaturaId === `k${i}`} onToggle={() => setOpenFaturaId(openFaturaId === `k${i}` ? null : `k${i}`)} />
            ))
          )
        )}

        {/* ── Bekleyen İadeler ── */}
        {faturaTab === 'iade' && (
          bekleyenIadeler.length === 0 ? <div className="sip-empty">İade yok</div> : (
            bekleyenIadeler.map((f, i) => (
              <div key={f.no || i} className="sip-fatura iade">
                <div className="sip-fatura-header">
                  <div><span className="sip-badge sip-badge-hazir" style={{ marginRight: 6 }}>{t.iade}</span><span className="sip-fatura-no">{f.no || '—'}</span></div>
                  <span className="sip-iade-tutar">-${fmt(f.tutar)}</span>
                </div>
                <div className="sip-fatura-meta"><span>{fmtD(f.tarih)}</span>{f.aciklama && <span>{f.aciklama}</span>}</div>
                {Array.isArray(f.kalemler) && f.kalemler.length > 0 && (
                  <div className="sip-kalem-detay">{f.kalemler.map((k, ki) => (
                    <div key={ki} className="sip-kalem-detay-row"><span>{k.urunAd || k.urunKod}</span><span>{k.adet}x · -${fmt(k.toplam)}</span></div>
                  ))}</div>
                )}
              </div>
            ))
          )
        )}

        {/* ── Ekstre İndirme (dönem seçimli) ── */}
        <div className="sip-ekstre">
          <span style={{ fontSize: 11, color: 'var(--sip-text-muted)', fontWeight: 600 }}>Ekstre:</span>
          <input type="date" value={ekstreBaslangic} onChange={e => setEkstreBaslangic(e.target.value)} className="sip-input" style={{ width: 130, fontSize: 11 }} />
          <span style={{ fontSize: 11, color: 'var(--sip-text-faint)' }}>—</span>
          <input type="date" value={ekstreBitis} onChange={e => setEkstreBitis(e.target.value)} className="sip-input" style={{ width: 130, fontSize: 11 }} />
          <button className="sip-btn sip-btn-secondary" style={{ fontSize: 10 }}>PDF</button>
          <button className="sip-btn sip-btn-secondary" style={{ fontSize: 10 }}>Excel</button>
        </div>
      </div>

      {/* ══ SAĞ PANEL: Dashboard Aktivite ══ */}
      <div className="sip-panel">
        {rightView === 'dashboard' ? (
          <DashboardView t={t} bildirimler={bildirimler} sonOdemeler={sonOdemeler}
            okunmamisSayisi={okunmamisSayisi} hesap={hesap} tlKur={tlKur}
            onViewBildirimler={() => setRightView('bildirimler')} onViewOdemeler={() => setRightView('odemeler')} />
        ) : rightView === 'bildirimler' ? (
          <BildirimlerView t={t} bildirimler={bildirimler} okunmamisSayisi={okunmamisSayisi}
            onOkundu={bildirimOkundu} onTumunuOkundu={tumunuOkundu} onBack={() => setRightView('dashboard')} />
        ) : (
          <OdemelerView t={t} sonOdemeler={sonOdemeler} tlKur={tlKur} onBack={() => setRightView('dashboard')} />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Dashboard View (sağ panel default)
// ══════════════════════════════════════════════════════
function DashboardView({ t, bildirimler, sonOdemeler, okunmamisSayisi, hesap, tlKur, onViewBildirimler, onViewOdemeler }) {
  return (
    <div>
      <div className="sip-panel-title" style={{ fontSize: 14, fontWeight: 700 }}>Dashboard</div>

      {/* Son 5 Bildirim */}
      <div className="sip-right-section">
        <div className="sip-section-title" style={{ cursor: 'pointer' }} onClick={onViewBildirimler}>
          <span>{t.bildirimler} {okunmamisSayisi > 0 && <span style={{ color: 'var(--sip-danger)', fontSize: 11 }}>({okunmamisSayisi} yeni)</span>}</span>
          <span style={{ fontSize: 11, color: 'var(--sip-accent)' }}>Tümü →</span>
        </div>
        {bildirimler.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '8px 0' }}>{t.bildirim_yok}</div>
          : bildirimler.slice().reverse().slice(0, 5).map(b => (
            <div key={b.id} className={`sip-bildirim ${b.okundu ? 'okundu' : 'yeni'}`}>
              <span className="sip-bildirim-dot" style={{ background: b.okundu ? 'var(--sip-text-faint)' : 'var(--sip-accent)' }} />
              <span className="sip-bildirim-mesaj">{b.mesaj}</span>
              <span className="sip-bildirim-tarih">{fmtD(b.tarih)}</span>
            </div>
          ))
        }
      </div>

      {/* Son 5 Ödeme */}
      <div className="sip-right-section">
        <div className="sip-section-title" style={{ cursor: 'pointer' }} onClick={onViewOdemeler}>
          <span>{t.odemeler}</span>
          <span style={{ fontSize: 11, color: 'var(--sip-accent)' }}>Tümü →</span>
        </div>
        {sonOdemeler.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '8px 0' }}>{t.odeme_yok}</div>
          : sonOdemeler.slice().reverse().slice(0, 5).map((o, i) => (
            <div key={i} className={`sip-odeme ${o.tip === 'mahsup' ? 'sip-odeme-mahsup' : ''}`}>
              <div>
                <div className="sip-odeme-tarih-lg">{fmtDLong(o.tarih)}</div>
                <div className="sip-odeme-yontem-lg">{o.yontem || '—'}{o.tip === 'mahsup' && <span className="sip-badge sip-badge-hazir" style={{ fontSize: 8, marginLeft: 4 }}>Mahsup</span>}</div>
              </div>
              <div className="sip-odeme-tutar-lg">
                ${fmt(o.tutar)}
                {tlKur > 0 && <div style={{ fontSize: 10, color: 'var(--sip-text-faint)' }}>≈₺{fmt(o.tutar * tlKur, 0)}</div>}
              </div>
            </div>
          ))
        }
      </div>

      {/* Harcama Trendi (6 ay) */}
      <div className="sip-right-section">
        <div className="sip-section-title">Harcama Trendi</div>
        <TrendChart data={hesap.trendData} tlKur={tlKur} />
      </div>

      {/* İletişim */}
      <div className="sip-destek">
        Sorularınız için: <a href="https://wa.me/905xxxxxxxxx" target="_blank" rel="noopener noreferrer">WhatsApp</a> · <a href="mailto:info@bekilligroup.com">E-posta</a>
      </div>
    </div>
  );
}

// ── Bildirimler Tam Geçmiş ───────────────────────────
function BildirimlerView({ t, bildirimler, okunmamisSayisi, onOkundu, onTumunuOkundu, onBack }) {
  return (
    <div>
      <div className="sip-panel-title" style={{ display: 'flex', alignItems: 'center' }}>
        <button className="sip-btn sip-btn-secondary" onClick={onBack} style={{ fontSize: 10, marginRight: 8 }}>← Geri</button>
        <span style={{ flex: 1 }}>{t.bildirimler}</span>
        {okunmamisSayisi > 0 && <button className="sip-bildirim-link" onClick={onTumunuOkundu}>{t.tumunu_oku}</button>}
      </div>
      {bildirimler.length === 0 ? <div className="sip-empty">{t.bildirim_yok}</div> : (
        bildirimler.slice().reverse().map(b => (
          <div key={b.id} className={`sip-bildirim ${b.okundu ? 'okundu' : 'yeni'}`} onClick={() => !b.okundu && onOkundu([b.id])}>
            <span className="sip-bildirim-dot" style={{ background: b.okundu ? 'var(--sip-text-faint)' : 'var(--sip-accent)' }} />
            <span className="sip-bildirim-mesaj">{b.mesaj}</span>
            <span className="sip-bildirim-tarih">{fmtDLong(b.tarih)}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── Ödemeler Tam Geçmiş ──────────────────────────────
function OdemelerView({ t, sonOdemeler, tlKur, onBack }) {
  return (
    <div>
      <div className="sip-panel-title" style={{ display: 'flex', alignItems: 'center' }}>
        <button className="sip-btn sip-btn-secondary" onClick={onBack} style={{ fontSize: 10, marginRight: 8 }}>← Geri</button>
        <span>{t.odemeler}</span>
      </div>
      {sonOdemeler.length === 0 ? <div className="sip-empty">{t.odeme_yok}</div> : (
        sonOdemeler.slice().reverse().map((o, i) => (
          <div key={i} className={`sip-odeme ${o.tip === 'mahsup' ? 'sip-odeme-mahsup' : ''}`}>
            <div>
              <div className="sip-odeme-tarih-lg">{fmtDLong(o.tarih)}</div>
              <div className="sip-odeme-yontem-lg">{o.yontem || '—'}{o.tip === 'mahsup' && <span className="sip-badge sip-badge-hazir" style={{ fontSize: 8, marginLeft: 4 }}>Mahsup</span>}</div>
              {Array.isArray(o.eslesmeler) && o.eslesmeler.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                  {o.eslesmeler.map((e, ei) => <span key={ei} className="sip-esleme">{e.faturaNo}: ${fmt(e.kapatilan)}</span>)}
                </div>
              )}
            </div>
            <div className="sip-odeme-tutar-lg">
              ${fmt(o.tutar)}
              {o.orijinalTutar && o.doviz !== 'USD' && <div style={{ fontSize: 11, color: 'var(--sip-text-muted)' }}>{fmt(o.orijinalTutar)} {o.doviz}</div>}
              {tlKur > 0 && <div style={{ fontSize: 10, color: 'var(--sip-text-faint)' }}>≈₺{fmt(o.tutar * tlKur, 0)}</div>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Fatura Card (açık + kapanan, accordion) ──────────
function FaturaCard({ f, t, tlKur, isOpen, onToggle, kapali }) {
  const gecikmeKlass = !kapali && f.gecikmeGun >= 30 ? 'sip-gecikme-kritik' : !kapali && f.gecikmeGun >= 7 ? 'sip-gecikme-uyari' : '';
  const progress = f.tutar > 0 ? Math.min(100, ((f.odenen || 0) / f.tutar) * 100) : 0;

  return (
    <div>
      <div className={`sip-fatura ${kapali ? 'sip-fatura-kapali' : ''}`} onClick={onToggle} style={kapali ? { opacity: 0.75 } : undefined}>
        <div className="sip-fatura-header">
          <span className="sip-fatura-no">
            {f.no || '—'}
            {!kapali && f.gecikmeGun > 0 && <span className={`sip-gecikme ${gecikmeKlass}`}>{f.gecikmeGun} {t.gun}</span>}
            {kapali && <span style={{ fontSize: 10, color: 'var(--sip-success-text)', marginLeft: 6, fontWeight: 600 }}>✓</span>}
          </span>
          {kapali ? <span style={{ fontSize: 12, color: 'var(--sip-text-muted)' }}>${fmt(f.tutar)}</span> : <span className="sip-fatura-kalan">${fmt(f.kalan)}</span>}
        </div>
        <div className="sip-fatura-meta">
          <span>{fmtD(f.tarih)}</span>
          {!kapali && <span>{t.toplam}: ${fmt(f.tutar)}</span>}
          {!kapali && <span>{t.odenen}: ${fmt(f.odenen || 0)}</span>}
        </div>
        {!kapali && <div className="sip-fatura-bar"><div className="sip-fatura-bar-fill" style={{ width: `${progress}%` }} /></div>}
      </div>
      {isOpen && (
        <div className="sip-kalem-detay">
          {f.orijinalDoviz && f.orijinalDoviz !== 'USD' && <div className="sip-kalem-detay-row"><span>{f.orijinalDoviz}</span><span>{fmt(f.orijinalTutar)}</span></div>}
          {tlKur > 0 && <div className="sip-kalem-detay-row"><span>TL karşılığı</span><span>₺{fmt((f.tutar || 0) * tlKur, 0)}</span></div>}
          {f.kdvOrani > 0 && <div className="sip-kalem-detay-row"><span>KDV %{f.kdvOrani}</span><span>${fmt(f.kdvTutar)}</span></div>}
          {Array.isArray(f.kalemler) && f.kalemler.length > 0 && f.kalemler.map((k, ki) => (
            <div key={ki} className="sip-kalem-detay-row"><span>{k.urunAd || k.urunKod} ({k.adet}x)</span><span>${fmt(k.toplam)}</span></div>
          ))}
          <div className="sip-fatura-actions">
            <button className="sip-fatura-action">PDF</button>
            <button className="sip-fatura-action">Excel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trend Chart (6 ay bar) ───────────────────────────
function TrendChart({ data, tlKur }) {
  if (!data || data.length === 0) return <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '8px 0' }}>Henüz yeterli veri yok</div>;
  const max = Math.max(...data.map(d => d.tutar || 0), 1);
  const lastIdx = data.length - 1;

  return (
    <div className="sip-trend">
      {data.map((d, i) => (
        <div key={i} className="sip-trend-col">
          <div className={`sip-trend-bar ${i === lastIdx ? 'current' : ''}`}
            style={{ height: `${Math.max(8, ((d.tutar || 0) / max) * 100)}%` }}
            title={`${d.ay}: $${fmt(d.tutar)}`} />
          <div className="sip-trend-label">{d.ay}</div>
          <div className="sip-trend-val">${fmt(d.tutar, 0)}</div>
          {tlKur > 0 && <div className="sip-trend-val" style={{ fontSize: 8, opacity: 0.5 }}>₺{fmt((d.tutar || 0) * tlKur, 0)}</div>}
        </div>
      ))}
    </div>
  );
}
