// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal v4.2: HesabimPage
// 2 panel: Bakiye + Faturalar (sol 58%) + Dashboard Aktivite (sağ 42%)
// Sağ panel: özet kartlar (5 bildirim + 5 ödeme) → tıklayınca tam geçmiş
// ══════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react';

const API = '/api/siparis';
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';
const fmtDLong = (d) => d ? new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

// ── XLSX CDN ────────────────────────────────────────
function loadXLSX() {
  if (window._XLSX_FULL) return Promise.resolve(window._XLSX_FULL);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => { window._XLSX_FULL = window.XLSX; res(window.XLSX); };
    s.onerror = () => rej(new Error('SheetJS CDN yüklenemedi'));
    document.head.appendChild(s);
  });
}

// ── Fatura PDF (popup + print) ──────────────────────
function faturaPdfAc(f, tlKur) {
  const kalemRows = (f.kalemler || []).map(k =>
    `<tr><td style="padding:6px 8px">${k.urunAd || k.urunKod}${k.not ? `<div style="font-size:10px;color:#888;font-style:italic;margin-top:2px">💬 ${k.not}</div>` : ''}</td><td style="padding:6px 8px;text-align:center">${k.adet}</td><td style="padding:6px 8px;text-align:right">$${fmt(k.birimFiyat || 0)}</td><td style="padding:6px 8px;text-align:right">$${fmt(k.toplam || 0)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fatura ${f.no || ''}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#1a1a1a}h2{margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f0f1f5;font-size:11px;padding:8px;text-align:left;border-bottom:2px solid #d1d6e0}
td{font-size:12px;border-bottom:1px solid #e8e8e8}.meta{font-size:12px;color:#666;margin:4px 0}
.total{text-align:right;font-size:16px;font-weight:700;margin-top:12px}@media print{body{padding:16px}}</style></head>
<body><h2>Fatura: ${f.no || '—'}</h2>
<div class="meta">Tarih: ${fmtD(f.tarih)}</div>
<div class="meta">Toplam: $${fmt(f.tutar)}${tlKur > 0 ? ` (≈₺${fmt(f.tutar * tlKur, 0)})` : ''}</div>
${f.odenen ? `<div class="meta">Ödenen: $${fmt(f.odenen)} · Kalan: $${fmt(f.kalan || 0)}</div>` : ''}
${f.orijinalDoviz && f.orijinalDoviz !== 'USD' ? `<div class="meta">${f.orijinalDoviz}: ${fmt(f.orijinalTutar)}</div>` : ''}
${f.kdvOrani > 0 ? `<div class="meta">KDV %${f.kdvOrani}: $${fmt(f.kdvTutar)}</div>` : ''}
${kalemRows ? `<table><thead><tr><th>Ürün</th><th style="text-align:center">Adet</th><th style="text-align:right">Birim Fiyat</th><th style="text-align:right">Toplam</th></tr></thead><tbody>${kalemRows}</tbody></table>` : ''}
<div class="total">Toplam: $${fmt(f.tutar)}</div>
<script>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=700,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Fatura Excel ────────────────────────────────────
async function faturaExcelIndir(f) {
  const XLSX = await loadXLSX();
  const rows = [['Fatura No', 'Tarih', 'Toplam ($)', 'Ödenen ($)', 'Kalan ($)'],
    [f.no || '', fmtD(f.tarih), f.tutar || 0, f.odenen || 0, f.kalan || 0]];
  if (f.kalemler && f.kalemler.length > 0) {
    const hasNot = f.kalemler.some(k => k.not);
    rows.push([]);
    rows.push(hasNot ? ['Ürün', 'Adet', 'Birim Fiyat ($)', 'Toplam ($)', 'Not'] : ['Ürün', 'Adet', 'Birim Fiyat ($)', 'Toplam ($)']);
    f.kalemler.forEach(k => {
      const row = [k.urunAd || k.urunKod, k.adet, k.birimFiyat || 0, k.toplam || 0];
      if (hasNot) row.push(k.not || '');
      rows.push(row);
    });
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fatura');
  XLSX.writeFile(wb, `Fatura_${f.no || 'export'}.xlsx`);
}

// ── Ekstre PDF (dönem) ──────────────────────────────
function ekstrePdfAc(faturalar, baslangic, bitis, bakiye, tlKur) {
  const filtered = filterByDate(faturalar, baslangic, bitis);
  const rows = filtered.map(f =>
    `<tr><td style="padding:5px 8px">${f.no||'—'}</td><td style="padding:5px 8px">${fmtD(f.tarih)}</td><td style="padding:5px 8px;text-align:right">$${fmt(f.tutar)}</td><td style="padding:5px 8px;text-align:right">$${fmt(f.odenen||0)}</td><td style="padding:5px 8px;text-align:right">$${fmt(f.kalan||0)}</td></tr>`
  ).join('');
  const donem = baslangic || bitis ? `${baslangic || '...'} — ${bitis || '...'}` : 'Tüm dönem';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ekstre</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#1a1a1a}h2{margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#f0f1f5;font-size:11px;padding:6px 8px;text-align:left;border-bottom:2px solid #d1d6e0}
td{font-size:12px;border-bottom:1px solid #e8e8e8}.meta{font-size:12px;color:#666;margin:4px 0}
.summary{margin-top:16px;padding:12px;background:#f7f8fa;border-radius:8px;font-size:13px}
@media print{body{padding:16px}}</style></head>
<body><h2>Hesap Ekstresi</h2>
<div class="meta">Dönem: ${donem}</div>
<div class="meta">${filtered.length} fatura</div>
<div class="summary">Bakiye: $${fmt(Math.abs(bakiye?.net||0))} ${(bakiye?.net||0) > 0 ? '(Borçlu)' : (bakiye?.net||0) < 0 ? '(Alacaklı)' : ''}${tlKur > 0 ? ` · ≈₺${fmt(Math.abs(bakiye?.net||0)*tlKur,0)}` : ''}</div>
<table><thead><tr><th>Fatura No</th><th>Tarih</th><th style="text-align:right">Tutar</th><th style="text-align:right">Ödenen</th><th style="text-align:right">Kalan</th></tr></thead><tbody>${rows}</tbody></table>
<script>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=700,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Ekstre Excel (dönem) ────────────────────────────
async function ekstreExcelIndir(faturalar, baslangic, bitis, bakiye) {
  const XLSX = await loadXLSX();
  const filtered = filterByDate(faturalar, baslangic, bitis);
  const rows = [['Fatura No', 'Tarih', 'Tutar ($)', 'Ödenen ($)', 'Kalan ($)']];
  filtered.forEach(f => rows.push([f.no || '', fmtD(f.tarih), f.tutar || 0, f.odenen || 0, f.kalan || 0]));
  rows.push([]);
  rows.push(['', '', 'Toplam Borç', 'Toplam Alacak', 'Net Bakiye']);
  rows.push(['', '', bakiye?.toplamBorc || 0, bakiye?.toplamAlacak || 0, bakiye?.net || 0]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ekstre');
  XLSX.writeFile(wb, `Ekstre_${baslangic || 'tum'}_${bitis || 'donem'}.xlsx`);
}

// ── Tarih filtresi ──────────────────────────────────
function filterByDate(faturalar, baslangic, bitis) {
  if (!baslangic && !bitis) return faturalar;
  return faturalar.filter(f => {
    if (!f.tarih) return true;
    const t = f.tarih.slice(0, 10);
    if (baslangic && t < baslangic) return false;
    if (bitis && t > bitis) return false;
    return true;
  });
}

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
          <button className="sip-btn sip-btn-secondary" style={{ fontSize: 10 }}
            onClick={() => ekstrePdfAc([...acikFaturalar, ...kapananFaturalar], ekstreBaslangic, ekstreBitis, bakiye, tlKur)}>PDF</button>
          <button className="sip-btn sip-btn-secondary" style={{ fontSize: 10 }}
            onClick={() => ekstreExcelIndir([...acikFaturalar, ...kapananFaturalar], ekstreBaslangic, ekstreBitis, bakiye)}>Excel</button>
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
        Sorularınız için: <a href="https://wa.me/905383487516" target="_blank" rel="noopener noreferrer">WhatsApp</a> · <a href="mailto:info@bekilligroup.com">E-posta</a>
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
            <div key={ki}>
              <div className="sip-kalem-detay-row"><span>{k.urunAd || k.urunKod} ({k.adet}x)</span><span>${fmt(k.toplam)}</span></div>
              {k.not && <div style={{ fontSize: 9, color: 'var(--sip-text-muted)', fontStyle: 'italic', paddingLeft: 8, marginTop: -2, marginBottom: 4 }}>💬 {k.not}</div>}
            </div>
          ))}
          <div className="sip-fatura-actions">
            <button className="sip-fatura-action" onClick={e => { e.stopPropagation(); faturaPdfAc(f, tlKur); }}>PDF</button>
            <button className="sip-fatura-action" onClick={e => { e.stopPropagation(); faturaExcelIndir(f); }}>Excel</button>
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
