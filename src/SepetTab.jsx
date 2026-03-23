// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Sipariş Portali: SepetTab + FilterSection
// SIP-App.jsx'ten ayrıştırıldı — davranış değişikliği yok
// ══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from 'react';

// ── Filter Section ──────────────────────────────────
function FilterSection({ title, items, value, onChange, allLabel }) {
  return (
    <div className="sip-filter-section">
      <div className="sip-filter-title">{title}</div>
      <div
        className={`sip-filter-item ${!value ? 'active' : ''}`}
        onClick={() => onChange('')}
      >{allLabel}</div>
      {items.map(item => (
        <div
          key={item}
          className={`sip-filter-item ${value === item ? 'active' : ''}`}
          onClick={() => onChange(value === item ? '' : item)}
        >{item}</div>
      ))}
    </div>
  );
}

// ── Sepet Tab (Sağ Panel Ana Sekme) ─────────────────
function SepetTab({ t, sepet, fiyatlar, katalog, busy, onSil, onAdetGuncelle, onEkle, onGonder }) {
  // Autocomplete
  const [acInput, setAcInput] = useState('');
  const [acOpen, setAcOpen] = useState(false);
  const acRef = useRef(null);

  const acResults = useMemo(() => {
    if (!acInput || acInput.length < 2) return [];
    const s = acInput.toLowerCase();
    return katalog.filter(u =>
      u.kod?.toLowerCase().includes(s) || u.ad?.toLowerCase().includes(s) || u.parcaNo?.toLowerCase().includes(s)
    ).slice(0, 8);
  }, [acInput, katalog]);

  function acSelect(urun) {
    onEkle(urun.kod, urun.ad, 1);
    setAcInput('');
    setAcOpen(false);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) { if (acRef.current && !acRef.current.contains(e.target)) setAcOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Inline new row
  const [newAdet, setNewAdet] = useState('1');
  const [newKod, setNewKod] = useState('');
  const [newAcOpen, setNewAcOpen] = useState(false);
  const newRef = useRef(null);

  const newAcResults = useMemo(() => {
    if (!newKod || newKod.length < 2) return [];
    const s = newKod.toLowerCase();
    return katalog.filter(u =>
      u.kod?.toLowerCase().includes(s) || u.ad?.toLowerCase().includes(s) || u.parcaNo?.toLowerCase().includes(s)
    ).slice(0, 6);
  }, [newKod, katalog]);

  function newRowSelect(urun) {
    onEkle(urun.kod, urun.ad, parseInt(newAdet) || 1);
    setNewKod('');
    setNewAdet('1');
    setNewAcOpen(false);
  }

  function newRowAdd() {
    if (!newKod.trim()) return;
    // Katalogda yoksa yeni ürün olarak ekle
    const found = katalog.find(u => u.kod?.toLowerCase() === newKod.trim().toLowerCase());
    if (found) {
      onEkle(found.kod, found.ad, parseInt(newAdet) || 1);
    } else {
      // Parça no olarak algıla, supplier boş
      onEkle(newKod.trim().toUpperCase(), newKod.trim().toUpperCase(), parseInt(newAdet) || 1, '', {
        parcaNo: newKod.trim(), supplier: '', kategori: '',
      });
    }
    setNewKod('');
    setNewAdet('1');
    setNewAcOpen(false);
  }

  useEffect(() => {
    function handleClick(e) { if (newRef.current && !newRef.current.contains(e.target)) setNewAcOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Toplam hesapla
  const sepetOzet = useMemo(() => {
    let fiyatliToplam = 0;
    let fiyatSorulacak = 0;
    let topAdet = 0;
    sepet.forEach(item => {
      topAdet += item.adet;
      const f = fiyatlar[item.urunKod];
      if (f?.fiyat) {
        fiyatliToplam += item.adet * f.fiyat;
      } else {
        fiyatSorulacak++;
      }
    });
    const doviz = Object.values(fiyatlar).find(f => f?.doviz)?.doviz || 'USD';
    return { fiyatliToplam, fiyatSorulacak, topAdet, doviz };
  }, [sepet, fiyatlar]);

  return (
    <div className="sip-sepet-tab">
      {/* Autocomplete arama */}
      <div className="sip-ac-wrap" ref={acRef}>
        <input
          type="text" value={acInput}
          onChange={e => { setAcInput(e.target.value); setAcOpen(true); }}
          onFocus={() => acInput.length >= 2 && setAcOpen(true)}
          placeholder={t.ekle_placeholder}
          className="sip-ac-input"
        />
        {acOpen && acResults.length > 0 && (
          <div className="sip-ac-dropdown">
            {acResults.map(u => (
              <div key={u.kod} className="sip-ac-item" onClick={() => acSelect(u)}>
                <span>{u.kod} — {u.ad}</span>
                <span className={`sip-ac-stock ${u.stokVar ? 'in' : 'out'}`}>
                  {u.stokVar ? t.stokta : t.stok_yok}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sepet listesi */}
      {sepet.length === 0 ? (
        <div className="sip-empty">{t.sepet_bos}</div>
      ) : (
        <>
          <div className="sip-cart-header">
            <span>{t.adet}</span>
            <span>{t.urun}</span>
            <span style={{textAlign:'right'}}>{t.toplam}</span>
            <span></span>
          </div>
          {sepet.map(item => {
            const f = fiyatlar[item.urunKod];
            const satirToplam = f?.fiyat ? item.adet * f.fiyat : null;
            // Supplier'ı koddan çıkar (3264700-AMBAC → AMBAC)
            const parts = item.urunKod.split('-');
            const supplier = parts.length > 1 ? parts[parts.length - 1] : '';
            return (
              <div key={item.id} className="sip-cart-row">
                <input
                  type="number" min="1" max="99999" value={item.adet}
                  onChange={e => onAdetGuncelle(item.id, e.target.value)}
                  className="sip-cr-adet"
                />
                <div className="sip-cr-urun">
                  <span className="sip-cr-name">{item.urunAd}</span>
                  {supplier && <span className="sip-cr-supplier">{supplier}</span>}
                  {item.yeniUrunData && <span className="sip-new-badge">NEW</span>}
                </div>
                <div className="sip-cr-fiyat">
                  {satirToplam != null
                    ? <>{satirToplam.toLocaleString()} <span className="sip-cr-doviz">{f.doviz || 'USD'}</span></>
                    : <span className="sip-cr-soru">?</span>
                  }
                </div>
                <button className="sip-cr-del" onClick={() => onSil(item.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            );
          })}
        </>
      )}

      {/* Inline yeni satır ekleme */}
      <div className="sip-new-row" ref={newRef}>
        <input
          type="number" min="1" max="99999" value={newAdet}
          onChange={e => setNewAdet(e.target.value)}
          className="sip-nr-adet" placeholder={t.adet_gir}
        />
        <div className="sip-nr-input-wrap">
          <input
            type="text" value={newKod}
            onChange={e => { setNewKod(e.target.value); setNewAcOpen(true); }}
            onFocus={() => newKod.length >= 2 && setNewAcOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter') newRowAdd(); }}
            placeholder={t.ekle_placeholder}
            className="sip-nr-input"
          />
          {newAcOpen && newAcResults.length > 0 && (
            <div className="sip-ac-dropdown sip-nr-dropdown">
              {newAcResults.map(u => (
                <div key={u.kod} className="sip-ac-item" onClick={() => newRowSelect(u)}>
                  <span>{u.kod} — {u.ad}</span>
                  <span className={`sip-ac-stock ${u.stokVar ? 'in' : 'out'}`}>
                    {u.stokVar ? t.stokta : t.stok_yok}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="sip-nr-add" onClick={newRowAdd} disabled={!newKod.trim()}>+</button>
      </div>

      {/* Toplam + Gönder */}
      {sepet.length > 0 && (
        <div className="sip-summary">
          <div className="sip-sum-row">
            <span className="sip-muted">{sepet.length} {t.satirlar}, {sepetOzet.topAdet} {t.topAdet}</span>
          </div>
          <div className="sip-sum-row">
            <span className="sip-muted">{t.fiyatli_toplam}</span>
            <span>{sepetOzet.fiyatliToplam.toLocaleString()} {sepetOzet.doviz}</span>
          </div>
          {sepetOzet.fiyatSorulacak > 0 && (
            <div className="sip-sum-row">
              <span className="sip-muted">{t.fiyat_sorun_kalem}</span>
              <span className="sip-warn">{sepetOzet.fiyatSorulacak} {t.satirlar}</span>
            </div>
          )}
          <div className="sip-sum-row sip-sum-total">
            <span>{t.toplam}</span>
            <span>{sepetOzet.fiyatliToplam.toLocaleString()} {sepetOzet.doviz}</span>
          </div>
          <button className="sip-send-btn" onClick={onGonder} disabled={busy}>
            {busy ? t.gonderiliyor : t.gonder}
          </button>
        </div>
      )}
    </div>
  );
}


export { FilterSection, SepetTab };
