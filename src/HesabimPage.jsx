// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal v4: HesabimPage
// 2 panel: Bakiye + Faturalar (sol 58%) + Bildirimler/Ödemeler (sağ 42%)
// ══════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react';

const API = '/api/siparis';
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';

// ── HesabimPage ─────────────────────────────────────
export default function HesabimPage({ t, hesap, pin, onRefresh, fiyatlar, katalog }) {
  const [faturaTab, setFaturaTab] = useState('acik'); // acik | kapanan | iade
  const [acikFaturaIdx, setAcikFaturaIdx] = useState(null);
  const [rightTab, setRightTab] = useState('bildirimler'); // bildirimler | odemeler | sik

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
          <div className="sip-bakiye-doviz">
            {bakiye.net > 0.01 ? t.borc_durumu : bakiye.net < -0.01 ? t.alacak_durumu : ''}
          </div>
          <div className="sip-bakiye-row">
            <span>{t.toplam_borc}: ${fmt(bakiye.toplamBorc)}</span>
            <span>{t.toplam_alacak}: ${fmt(bakiye.toplamAlacak)}</span>
          </div>
          {bakiye.toplamBorc > 0 && (
            <>
              <div className="sip-bakiye-bar">
                <div className="sip-bakiye-bar-fill" style={{ width: `${Math.min(100, ((bakiye.toplamAlacak || 0) / bakiye.toplamBorc) * 100)}%` }} />
              </div>
              <div className="sip-bakiye-pct">
                %{Math.round(((bakiye.toplamAlacak || 0) / bakiye.toplamBorc) * 100)} ödendi
              </div>
            </>
          )}
        </div>

        {/* ── Fatura Sub-Tabs ── */}
        <div className="sip-subtabs">
          <button className={`sip-subtab ${faturaTab === 'acik' ? 'active' : ''}`} onClick={() => setFaturaTab('acik')}>
            {t.acik_fatura}
            {acikFaturalar.length > 0 && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>({acikFaturalar.length})</span>}
          </button>
          {kapananFaturalar.length > 0 && (
            <button className={`sip-subtab ${faturaTab === 'kapanan' ? 'active' : ''}`} onClick={() => setFaturaTab('kapanan')}>
              Kapanan ({kapananFaturalar.length})
            </button>
          )}
          {bekleyenIadeler.length > 0 && (
            <button className={`sip-subtab ${faturaTab === 'iade' ? 'active' : ''}`} onClick={() => setFaturaTab('iade')}>
              {t.iade} ({bekleyenIadeler.length})
            </button>
          )}
        </div>

        {/* ── Açık Faturalar ── */}
        {faturaTab === 'acik' && (
          <>
            {acikFaturalar.length > 0 && (
              <div className="sip-section-title">
                <span>{acikFaturalar.length} {t.fatura_kisa}</span>
                <span className="sip-section-sum">${fmt(acikToplam)}</span>
              </div>
            )}
            {acikFaturalar.length === 0 ? (
              <div className="sip-empty">{t.fatura_yok}</div>
            ) : (
              acikFaturalar.map((f, i) => (
                <FaturaCard key={f.no || i} f={f} t={t} isOpen={acikFaturaIdx === i}
                  onToggle={() => setAcikFaturaIdx(acikFaturaIdx === i ? null : i)} />
              ))
            )}
          </>
        )}

        {/* ── Kapanan Faturalar ── */}
        {faturaTab === 'kapanan' && (
          kapananFaturalar.length === 0 ? <div className="sip-empty">Kapanan fatura yok</div> : (
            kapananFaturalar.map((f, i) => (
              <div key={f.no || i} className="sip-fatura sip-fatura-kapali">
                <div className="sip-fatura-header">
                  <span className="sip-fatura-no">{f.no || '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--sip-success-text)', fontWeight: 600 }}>✓ Kapandı</span>
                </div>
                <div className="sip-fatura-meta">
                  <span>{fmtD(f.tarih)}</span>
                  <span>${fmt(f.tutar)}</span>
                </div>
              </div>
            ))
          )
        )}

        {/* ── Bekleyen İadeler ── */}
        {faturaTab === 'iade' && (
          bekleyenIadeler.length === 0 ? <div className="sip-empty">İade yok</div> : (
            bekleyenIadeler.map((f, i) => (
              <div key={f.no || i} className="sip-fatura iade">
                <div className="sip-fatura-header">
                  <div>
                    <span className="sip-badge sip-badge-hazir" style={{ marginRight: 6 }}>{t.iade}</span>
                    <span className="sip-fatura-no">{f.no || '—'}</span>
                  </div>
                  <span className="sip-iade-tutar">-${fmt(f.tutar)}</span>
                </div>
                <div className="sip-fatura-meta">
                  <span>{fmtD(f.tarih)}</span>
                  {f.aciklama && <span>{f.aciklama}</span>}
                </div>
                {Array.isArray(f.kalemler) && f.kalemler.length > 0 && (
                  <div className="sip-kalem-detay">
                    {f.kalemler.map((k, ki) => (
                      <div key={ki} className="sip-kalem-detay-row">
                        <span>{k.urunAd || k.urunKod}</span>
                        <span>{k.adet}x · -${fmt(k.toplam)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )
        )}

        {/* ── Ekstre indirme ── */}
        <div className="sip-ekstre">
          <span style={{ fontSize: 11, color: 'var(--sip-text-muted)' }}>Ekstre:</span>
          <button className="sip-btn sip-btn-secondary" style={{ fontSize: 10 }}>PDF</button>
          <button className="sip-btn sip-btn-secondary" style={{ fontSize: 10 }}>Excel</button>
        </div>
      </div>

      {/* ══ SAĞ PANEL: Aktivite ══ */}
      <div className="sip-panel">
        {/* Alt sekmeler */}
        <div className="sip-subtabs">
          <button className={`sip-subtab ${rightTab === 'bildirimler' ? 'active' : ''}`} onClick={() => setRightTab('bildirimler')}>
            {t.bildirimler}
            {okunmamisSayisi > 0 && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--sip-danger)' }}>({okunmamisSayisi})</span>}
          </button>
          <button className={`sip-subtab ${rightTab === 'odemeler' ? 'active' : ''}`} onClick={() => setRightTab('odemeler')}>
            {t.odemeler}
          </button>
          {sikAlinanlar.length > 0 && (
            <button className={`sip-subtab ${rightTab === 'sik' ? 'active' : ''}`} onClick={() => setRightTab('sik')}>
              {t.sik_alinanlar}
            </button>
          )}
        </div>

        {/* ── Bildirimler ── */}
        {rightTab === 'bildirimler' && (
          <div className="sip-right-section">
            {bildirimler.length === 0 ? (
              <div className="sip-empty">{t.bildirim_yok}</div>
            ) : (
              <>
                {okunmamisSayisi > 0 && (
                  <div style={{ textAlign: 'right', marginBottom: 6 }}>
                    <button className="sip-bildirim-link" onClick={tumunuOkundu}>{t.tumunu_oku}</button>
                  </div>
                )}
                {bildirimler.slice().reverse().slice(0, 15).map(b => (
                  <div key={b.id} className={`sip-bildirim ${b.okundu ? 'okundu' : 'yeni'}`}
                    onClick={() => !b.okundu && bildirimOkundu([b.id])}>
                    <span className="sip-bildirim-dot" style={{ background: b.okundu ? 'var(--sip-text-faint)' : 'var(--sip-accent)' }} />
                    <span className="sip-bildirim-mesaj">{b.mesaj}</span>
                    <span className="sip-bildirim-tarih">{fmtD(b.tarih)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Ödemeler ── */}
        {rightTab === 'odemeler' && (
          <div className="sip-right-section">
            <div className="sip-section-title">{t.odemeler}</div>
            {sonOdemeler.length === 0 ? (
              <div className="sip-empty">{t.odeme_yok}</div>
            ) : (
              sonOdemeler.slice().reverse().map((o, i) => (
                <div key={i} className={`sip-odeme ${o.tip === 'mahsup' ? 'sip-odeme-mahsup' : ''}`}>
                  <div>
                    <div className="sip-odeme-tarih">
                      {fmtD(o.tarih)}
                      {o.tip === 'mahsup' && <span className="sip-badge sip-badge-hazir" style={{ fontSize: 8, marginLeft: 4 }}>Mahsup</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sip-text-muted)' }}>{o.yontem || '—'}</div>
                    {Array.isArray(o.eslesmeler) && o.eslesmeler.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                        {o.eslesmeler.map((e, ei) => (
                          <span key={ei} className="sip-esleme">{e.faturaNo}: ${fmt(e.kapatilan)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`sip-odeme-tutar ${o.tip === 'mahsup' ? '' : ''}`}>
                    ${fmt(o.tutar)}
                    {o.orijinalTutar && o.doviz !== 'USD' && (
                      <div style={{ fontSize: 9, color: 'var(--sip-text-faint)' }}>{fmt(o.orijinalTutar)} {o.doviz}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Sık Alınanlar ── */}
        {rightTab === 'sik' && sikAlinanlar.length > 0 && (
          <div className="sip-right-section">
            <div className="sip-section-title">{t.sik_alinanlar}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sikAlinanlar.slice(0, 20).map(kod => (
                <span key={kod} className="sip-chip" style={{ cursor: 'default' }}>{kod}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Harcama Trendi (basit bar chart) ── */}
        {hesap.trendData && hesap.trendData.length > 0 && (
          <div className="sip-right-section">
            <div className="sip-section-title">Harcama Trendi</div>
            <TrendChart data={hesap.trendData} />
          </div>
        )}

        {/* ── Destek ── */}
        <div className="sip-destek">
          Sorularınız için: <a href="mailto:info@bekilligroup.com">info@bekilligroup.com</a>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Sub-Components
// ══════════════════════════════════════════════════════

// ── Fatura Card (açık fatura, accordion) ─────────────
function FaturaCard({ f, t, isOpen, onToggle }) {
  const gecikmeKlass = f.gecikmeGun >= 30 ? 'sip-gecikme-kritik' : f.gecikmeGun >= 7 ? 'sip-gecikme-uyari' : '';
  const progress = f.tutar > 0 ? Math.min(100, ((f.odenen || 0) / f.tutar) * 100) : 0;

  return (
    <div>
      <div className={`sip-fatura ${gecikmeKlass ? 'gecikme' : ''}`} onClick={onToggle}>
        <div className="sip-fatura-header">
          <span className="sip-fatura-no">
            {f.no || '—'}
            {f.gecikmeGun > 0 && <span className={`sip-gecikme ${gecikmeKlass}`}>{f.gecikmeGun} {t.gun}</span>}
          </span>
          <span className="sip-fatura-kalan">${fmt(f.kalan)}</span>
        </div>
        <div className="sip-fatura-meta">
          <span>{fmtD(f.tarih)}</span>
          <span>{t.toplam}: ${fmt(f.tutar)}</span>
          <span>{t.odenen}: ${fmt(f.odenen || 0)}</span>
        </div>
        <div className="sip-fatura-bar">
          <div className="sip-fatura-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Kalem detay (accordion) */}
      {isOpen && (
        <div className="sip-kalem-detay">
          {f.orijinalDoviz && f.orijinalDoviz !== 'USD' && (
            <div className="sip-kalem-detay-row">
              <span>{f.orijinalDoviz}</span>
              <span>{fmt(f.orijinalTutar)}</span>
            </div>
          )}
          {f.kdvOrani > 0 && (
            <div className="sip-kalem-detay-row">
              <span>KDV %{f.kdvOrani}</span>
              <span>${fmt(f.kdvTutar)}</span>
            </div>
          )}
          {Array.isArray(f.kalemler) && f.kalemler.length > 0 && (
            f.kalemler.map((k, ki) => (
              <div key={ki} className="sip-kalem-detay-row">
                <span>{k.urunAd || k.urunKod} ({k.adet}x)</span>
                <span>${fmt(k.toplam)}</span>
              </div>
            ))
          )}
          <div className="sip-fatura-actions">
            <button className="sip-fatura-action">PDF</button>
            <button className="sip-fatura-action">Excel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trend Chart (basit bar) ──────────────────────────
function TrendChart({ data }) {
  const max = Math.max(...data.map(d => d.tutar || 0), 1);
  const lastIdx = data.length - 1;

  return (
    <>
      <div className="sip-trend">
        {data.map((d, i) => (
          <div key={i} className={`sip-trend-bar ${i === lastIdx ? 'current' : ''}`}
            style={{ height: `${Math.max(8, ((d.tutar || 0) / max) * 100)}%` }}
            title={`${d.ay}: $${fmt(d.tutar)}`} />
        ))}
      </div>
      <div className="sip-trend-labels">
        <span>{data[0]?.ay}</span>
        <span>{data[lastIdx]?.ay}</span>
      </div>
    </>
  );
}
