// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Sipariş Portali: TakipTab + SiparisGrupList
// SIP-App.jsx'ten ayrıştırıldı — davranış değişikliği yok
// ══════════════════════════════════════════════════════════════════════

import { useState } from 'react';

// ── Takip Tab ───────────────────────────────────────
// ── Toplam hesaplama helper ──────────────────────────
function hesaplaToplamlar(kalemler, fiyatlar) {
  const map = {}; // doviz -> toplam
  let bilinmeyenVar = false;
  kalemler.forEach(k => {
    const f = fiyatlar[k.urunKod];
    if (f && f.fiyat) {
      const d = f.doviz || 'USD';
      map[d] = (map[d] || 0) + f.fiyat * k.adet;
    } else {
      bilinmeyenVar = true;
    }
  });
  return { map, bilinmeyenVar };
}

function formatToplamStr(map, bilinmeyenVar) {
  const parts = Object.entries(map).map(([doviz, tutar]) =>
    `${doviz === 'USD' ? '$' : doviz === 'EUR' ? '€' : doviz === 'TRY' ? '₺' : doviz + ' '}${tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  if (parts.length === 0) return null;
  return parts.join(' + ') + (bilinmeyenVar ? ' + fiyatsız kalemler' : '');
}

function TakipTab({ t, siparisler, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil, onRefresh }) {
  const beklemede = siparisler.filter(s => s.durum === 'beklemede');
  const hazirlaniyor = siparisler.filter(s => s.durum === 'hazirlaniyor');
  const kismi = siparisler.filter(s => s.durum === 'kismi');
  const tamamlandi = siparisler.filter(s => s.durum === 'tamamlandi');
  const iptal = siparisler.filter(s => s.durum === 'iptal');

  return (
    <div className="sip-takip-tab">
      {siparisler.length === 0 && <div className="sip-empty">{t.bos_siparis}</div>}
      {beklemede.length > 0 && (
        <SiparisGrupList label={t.beklemede} status="beklemede" items={beklemede} t={t} fiyatlar={fiyatlar} busy={busy} showToplamBanner onGrupSil={onGrupSil} onKalemGuncelle={onKalemGuncelle} onKalemSil={onKalemSil} />
      )}
      {hazirlaniyor.length > 0 && (
        <SiparisGrupList label={t.hazirlaniyor} status="hazirlaniyor" items={hazirlaniyor} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
      {kismi.length > 0 && (
        <SiparisGrupList label={t.kismi} status="kismi" items={kismi} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
      {tamamlandi.length > 0 && (
        <SiparisGrupList label={t.tamamlandi} status="tamamlandi" items={tamamlandi} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
      {iptal.length > 0 && (
        <SiparisGrupList label={t.iptal_durum} status="iptal" items={iptal} t={t} fiyatlar={fiyatlar} busy={busy} />
      )}
    </div>
  );
}

function SiparisGrupList({ label, status, items, t, fiyatlar, busy, showToplamBanner, onGrupSil, onKalemGuncelle, onKalemSil }) {
  // Beklemede banner: tüm gruplardaki tüm kalemlerin toplamı
  let bannerStr = null;
  if (showToplamBanner) {
    const tumKalemler = items.flatMap(g => g.kalemler || []);
    const { map, bilinmeyenVar } = hesaplaToplamlar(tumKalemler, fiyatlar);
    bannerStr = formatToplamStr(map, bilinmeyenVar);
  }

  return (
    <div className="sip-sgroup">
      <div className={`sip-sgroup-label status-${status}`}>
        {label} ({items.length})
        {bannerStr && <span className="sip-sgroup-toplam">{bannerStr}</span>}
      </div>
      {items.map(grup => (
        <SiparisGrupCard key={grup.id} grup={grup} t={t} fiyatlar={fiyatlar} busy={busy}
          onGrupSil={onGrupSil} onKalemGuncelle={onKalemGuncelle} onKalemSil={onKalemSil}
        />
      ))}
    </div>
  );
}

function SiparisGrupCard({ grup, t, fiyatlar, busy, onGrupSil, onKalemGuncelle, onKalemSil }) {
  const [open, setOpen] = useState(false);
  const kalemler = grup.kalemler || [];
  const tarih = new Date(grup.tarih).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const topKalem = kalemler.length;
  const topAdet = kalemler.reduce((s, k) => s + k.adet, 0);
  const topKarsilanan = kalemler.reduce((s, k) => s + (k.karsilanan || 0), 0);
  const editable = grup.durum === 'beklemede' && topKarsilanan === 0;

  // Grup toplamı (açıkken gösterilecek)
  const { map: grupMap, bilinmeyenVar: grupBilinmeyen } = hesaplaToplamlar(kalemler, fiyatlar);
  const grupToplamStr = formatToplamStr(grupMap, grupBilinmeyen);

  return (
    <div className={`sip-grup-card status-${grup.durum}`}>
      <div className="sip-gc-header" onClick={() => setOpen(o => !o)}>
        <div className="sip-gc-left">
          <span className="sip-gc-count">{topKalem} {t.satirlar}</span>
          <span className="sip-gc-adet">{topKarsilanan > 0 ? `${topKarsilanan}/` : ''}{topAdet} {t.topAdet}</span>
        </div>
        <div className="sip-gc-right">
          <span className="sip-gc-tarih">{tarih}</span>
          <span className={`sip-gc-chevron ${open ? 'open' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
      </div>

      {open && (
        <div className="sip-gc-kalemler">
          {kalemler.map(k => (
            <KalemRow key={k.id} k={k} grupId={grup.id} t={t} fiyat={fiyatlar[k.urunKod]}
              editable={editable} busy={busy} onGuncelle={onKalemGuncelle} onSil={onKalemSil}
              karsilamalar={grup.karsilamalar}
            />
          ))}
          {grupToplamStr && (
            <div className="sip-grup-toplam-row">
              <span>Toplam</span>
              <span className="sip-grup-toplam-val">{grupToplamStr}</span>
            </div>
          )}
          {editable && onGrupSil && (
            <button className="sip-gc-del" onClick={() => onGrupSil(grup.id)} disabled={busy}>
              {t.sil}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KalemRow({ k, grupId, t, fiyat, editable, busy, onGuncelle, onSil, karsilamalar }) {
  const [editMode, setEditMode] = useState(false);
  const [yeniAdet, setYeniAdet] = useState(String(k.adet));

  function handleSave() {
    const a = parseInt(yeniAdet);
    if (a && a !== k.adet && a >= 1) {
      onGuncelle?.(grupId, k.id, a);
    }
    setEditMode(false);
  }

  // B2: Karşılama fiyatı (son karşılamadan)
  const kalemKarsilamalar = (karsilamalar || []).filter(x => x.kalemId === k.id && x.miktar > 0);
  const sonKarsilama = kalemKarsilamalar.length > 0 ? kalemKarsilamalar[kalemKarsilamalar.length - 1] : null;
  // M11: Muadil bilgisi
  const muadilKarsilama = kalemKarsilamalar.find(x => x.muadilKod);

  const satirToplamStr = fiyat && fiyat.fiyat
    ? (() => {
        const sym = fiyat.doviz === 'USD' ? '$' : fiyat.doviz === 'EUR' ? '€' : fiyat.doviz === 'TRY' ? '₺' : (fiyat.doviz + ' ');
        const birim = `${sym}${fiyat.fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const top = `${sym}${(fiyat.fiyat * k.adet).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return { birim, top };
      })()
    : null;

  // B2: Karşılama fiyatı gösterimi (fiyat katalogda yoksa karşılamadaki fiyatı göster)
  const karsilamaFiyatStr = !satirToplamStr && sonKarsilama?.fiyat
    ? (() => {
        const sym = sonKarsilama.doviz === 'USD' ? '$' : sonKarsilama.doviz === 'EUR' ? '€' : (sonKarsilama.doviz + ' ');
        return `${sym}${sonKarsilama.fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      })()
    : null;

  return (
    <div className="sip-kalem-row">
      <div className="sip-kr-info">
        <span className="sip-kr-name">{k.urunAd}</span>
        <span className="sip-kr-code">{k.urunKod}</span>
        {/* M4: Hazırlanıyor badge */}
        {(k.hazirlanan || 0) > 0 && k.karsilanan < k.adet && (
          <span style={{display:"inline-block",fontSize:9,fontWeight:700,color:"#7C3AED",background:"${G.purple}1A",padding:"1px 6px",borderRadius:4,marginTop:2}}>
            🔧 {k.hazirlanan} hazırlanıyor
          </span>
        )}
        {/* M11: Muadil bilgisi */}
        {muadilKarsilama && (
          <span style={{display:"inline-block",fontSize:9,fontWeight:600,color:"#92400E",background:"rgba(245,158,11,0.1)",padding:"1px 6px",borderRadius:4,marginTop:2}}>
            {muadilKarsilama.muadilKod} ile gönderildi
          </span>
        )}
        {/* D2: İade bilgisi */}
        {(k.iadeler || []).length > 0 && (() => {
          const topIade = k.iadeler.reduce((s, i) => s + (i.miktar || 0), 0);
          const net = (k.karsilanan || 0) - topIade;
          return (
            <span style={{display:"inline-block",fontSize:9,fontWeight:600,color:"#DC2626",background:"${G.red}14",padding:"1px 6px",borderRadius:4,marginTop:2}}>
              {topIade} iade · Net: {net} adet
            </span>
          );
        })()}
      </div>
      <div className="sip-kr-right">
        {k.karsilanan > 0 && <span className="sip-kr-karsi">{k.karsilanan}/</span>}
        <span className="sip-kr-adet">{k.adet}</span>
        {satirToplamStr
          ? <span className="sip-kr-fiyat"><span className="sip-kr-birim-fiyat">{satirToplamStr.birim}</span><span className="sip-kr-x">×{k.adet} = </span><strong>{satirToplamStr.top}</strong></span>
          : karsilamaFiyatStr
            ? <span className="sip-kr-fiyat"><strong>{karsilamaFiyatStr}</strong><span className="sip-kr-x">/ad</span></span>
            : <span className="sip-kr-fiyat sip-kr-fiyat-yok">Fiyat sorulacak</span>
        }
        {k.yeniUrun && <span className="sip-new-badge">NEW</span>}
      </div>
      {editable && onSil && !editMode && (
        <div className="sip-kr-actions">
          <button onClick={() => { setYeniAdet(String(k.adet)); setEditMode(true); }} disabled={busy} className="sip-kr-btn">{t.adet}</button>
          <button onClick={() => onSil(grupId, k.id)} disabled={busy} className="sip-kr-btn del">{t.sil}</button>
        </div>
      )}
      {editMode && (
        <div className="sip-kr-edit">
          <input type="number" min="1" max="99999" value={yeniAdet}
            onChange={e => setYeniAdet(e.target.value)} className="sip-kr-edit-input"
            style={{ fontSize: 16 }} />
          <button onClick={handleSave} disabled={busy} className="sip-kr-btn">{t.guncelle}</button>
          <button onClick={() => setEditMode(false)} className="sip-kr-btn">{t.iptal_btn}</button>
        </div>
      )}
    </div>
  );
}

export { TakipTab };
