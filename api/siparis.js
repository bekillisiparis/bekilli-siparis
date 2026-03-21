// /api/siparis.js — Bekilli Sipariş Sistemi Vercel Serverless Function v2.0
// Müşteri: X-Siparis-PIN ile auth → sipariş ekle/sil/güncelle/oku
// Admin: X-Admin-PIN ile auth → katalog yayınla, müşteri/fiyat/hesap güncelle, sipariş karşıla/iptal
// Gist: Katalog (public) + Sipariş (private, müşteri başına dosya)

import { createHash, randomUUID } from 'crypto';

// ── ENV ──────────────────────────────────────────────
const TOKEN      = process.env.SIPARIS_GIST_TOKEN;
const SIP_GIST   = process.env.SIPARIS_GIST_ID;
const KAT_GIST   = process.env.KATALOG_GIST_ID;
const ADMIN_PIN_HASH = process.env.ADMIN_PIN_HASH; // SHA-256, Vercel env'de
const MUSTERI_ORIGIN = 'https://bekilli-siparis.vercel.app';
const ADMIN_ORIGIN   = 'https://bekilli-stok.vercel.app';

// ── Rate Limit (in-memory, cold start'ta sıfırlanır) ─
const ipHits = {};
const IP_LIMIT = 30;      // dakikada max istek
const IP_BAN_LIMIT = 5;   // hatalı PIN denemesi (müşteri)
const IP_BAN_MINUTES = 15;
const ADMIN_BAN_LIMIT = 3;   // hatalı admin PIN denemesi (daha sıkı)
const ADMIN_BAN_MINUTES = 30;
const ipBans = {};

function rateCheck(ip) {
  const now = Date.now();
  // Ban kontrolü
  if (ipBans[ip] && now < ipBans[ip]) return 'banned';
  // Rate limit
  if (!ipHits[ip]) ipHits[ip] = [];
  ipHits[ip] = ipHits[ip].filter(t => now - t < 60000);
  if (ipHits[ip].length >= IP_LIMIT) return 'limited';
  ipHits[ip].push(now);
  return 'ok';
}

function recordFailedPin(ip) {
  const key = `fail_${ip}`;
  if (!ipHits[key]) ipHits[key] = [];
  ipHits[key].push(Date.now());
  const recent = ipHits[key].filter(t => Date.now() - t < 60000);
  ipHits[key] = recent;
  if (recent.length >= IP_BAN_LIMIT) {
    ipBans[ip] = Date.now() + IP_BAN_MINUTES * 60000;
  }
}

function recordFailedAdminPin(ip) {
  const key = `afail_${ip}`;
  if (!ipHits[key]) ipHits[key] = [];
  ipHits[key].push(Date.now());
  const recent = ipHits[key].filter(t => Date.now() - t < 60000);
  ipHits[key] = recent;
  if (recent.length >= ADMIN_BAN_LIMIT) {
    ipBans[ip] = Date.now() + ADMIN_BAN_MINUTES * 60000;
  }
}

// ── Helpers ──────────────────────────────────────────
async function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

function stripHtml(str) {
  return String(str || '').replace(/<[^>]*>/g, '').trim();
}

function validateAdet(val) {
  const n = parseInt(val, 10);
  if (!Number.isInteger(n) || n < 1 || n > 99999) return null;
  return n;
}

function validateText(val, maxLen) {
  const s = stripHtml(val).slice(0, maxLen);
  return s || null;
}

// ── Gist API ─────────────────────────────────────────
const GIST_API = 'https://api.github.com/gists';
const gistHeaders = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'BekilliSiparis/1.0',
};
// PUBLIC Gist için auth gereksiz (token sorunu olsa bile çalışır)
const publicHeaders = {
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'BekilliSiparis/1.0',
};

async function gistRead(gistId, isPublic = false) {
  const hdrs = isPublic ? publicHeaders : gistHeaders;
  const res = await fetch(`${GIST_API}/${gistId}`, { headers: hdrs });
  if (!res.ok) throw new Error(`Gist okuma hatası: ${res.status}`);
  return res.json();
}

async function gistReadFile(gistId, filename, isPublic = false) {
  const gist = await gistRead(gistId, isPublic);
  const file = gist.files?.[filename];
  if (!file) return null;
  // Truncated dosya kontrolü (1MB+ dosyalar)
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const hdrs = isPublic ? publicHeaders : gistHeaders;
    const raw = await fetch(file.raw_url, { headers: hdrs });
    if (!raw.ok) throw new Error(`Gist raw okuma hatası: ${raw.status}`);
    content = await raw.text();
  }
  try { return JSON.parse(content); } catch { return null; }
}

async function gistWriteFile(gistId, filename, data) {
  const res = await fetch(`${GIST_API}/${gistId}`, {
    method: 'PATCH',
    headers: { ...gistHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: { [filename]: { content: JSON.stringify(data) } }
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gist yazma hatası: ${res.status}`);
  }
  return true;
}

// ── PIN → Müşteri doğrulama ─────────────────────────
// GÜVENLİK: musteriler.json PRIVATE Gist'te (SIP_GIST)
// PUBLIC Gist'te (KAT_GIST) müşteri bilgisi ASLA bulunmaz
async function authenticatePin(pin) {
  const hash = await hashPin(pin);
  const musteriler = await gistReadFile(SIP_GIST, 'musteriler.json');
  if (!musteriler?.length) return null;
  return musteriler.find(m => m.pinHash === hash) || null;
}

// ── Müşteri fiyat dosyası okuma ─────────────────────
async function readFiyatlar(musteriId) {
  const filename = `fiyat_${musteriId}.json`;
  const data = await gistReadFile(SIP_GIST, filename);
  return data || {};
}

// ── Sipariş dosyası okuma/yazma ─────────────────────
async function readSiparisler(musteriId) {
  const filename = `siparisler_${musteriId}.json`;
  const data = await gistReadFile(SIP_GIST, filename);
  return data || { musteriId, siparisler: [] };
}

async function writeSiparisler(musteriId, data) {
  const filename = `siparisler_${musteriId}.json`;
  data.sonGuncelleme = new Date().toISOString();
  return gistWriteFile(SIP_GIST, filename, data);
}

// ── Grup Durum Hesaplama (Karma: otomatik + override) ─
function deriveDurum(kalemler, durumOverride) {
  if (durumOverride) return durumOverride; // Admin override varsa o geçerli
  if (!kalemler || kalemler.length === 0) return 'beklemede';
  const hepsiTamam = kalemler.every(k => k.karsilanan >= k.adet);
  const hicBaslamamis = kalemler.every(k => k.karsilanan === 0);
  if (hepsiTamam) return 'tamamlandi';
  if (hicBaslamamis) return 'beklemede';
  return 'kismi';
}

// ── İşlem: Sipariş Ekle (Toplu — tüm sepet tek grup) ──
function handleEkle(sipData, body) {
  const kalemlerRaw = body.kalemler;
  if (!Array.isArray(kalemlerRaw) || kalemlerRaw.length === 0) {
    return { hata: 'En az 1 kalem gerekli', status: 400 };
  }
  if (kalemlerRaw.length > 200) {
    return { hata: 'Tek siparişte en fazla 200 kalem', status: 400 };
  }

  const kalemler = [];
  for (const k of kalemlerRaw) {
    const urunKod = validateText(k.urunKod, 100);
    const urunAd  = validateText(k.urunAd, 200);
    const adet    = validateAdet(k.adet);
    if (!urunKod) return { hata: 'Ürün kodu gerekli', status: 400 };
    if (!adet)    return { hata: `Geçerli adet giriniz: ${urunKod}`, status: 400 };

    const kalem = {
      id: randomUUID(),
      urunKod,
      urunAd: urunAd || urunKod,
      adet,
      karsilanan: 0,
      not: stripHtml(k.not || '').slice(0, 500),
    };

    if (k.yeniUrun) {
      kalem.yeniUrun = true;
      kalem.parcaNo  = validateText(k.parcaNo, 50) || '';
      kalem.supplier = validateText(k.supplier, 50) || '';
      kalem.kategori = validateText(k.kategori, 50) || '';
    }

    kalemler.push(kalem);
  }

  const siparis = {
    id: randomUUID(),
    tarih: new Date().toISOString(),
    durumOverride: null,
    kalemler,
    karsilamalar: [],
  };

  sipData.siparisler.push(siparis);
  return { ok: true, siparis: { ...siparis, durum: deriveDurum(kalemler, null) } };
}

// ── İşlem: Sipariş Grubu Sil ───────────────────────────
function handleSil(sipData, body) {
  const siparisId = body.siparisId;
  if (!siparisId) return { hata: 'siparisId gerekli', status: 400 };

  const idx = sipData.siparisler.findIndex(s => s.id === siparisId);
  if (idx === -1) return { hata: 'Sipariş bulunamadı', status: 404 };

  const sip = sipData.siparisler[idx];
  const durum = deriveDurum(sip.kalemler, sip.durumOverride);
  // Karşılanmaya başlanmış veya tamamlanmış sipariş silinemez
  if (durum === 'kismi' || durum === 'tamamlandi') {
    return { hata: 'Karşılanmaya başlanmış sipariş silinemez', status: 400 };
  }

  sipData.siparisler.splice(idx, 1);
  return { ok: true };
}

// ── İşlem: Sipariş Kalem Güncelle (adet/not) ───────────
function handleGuncelle(sipData, body) {
  const siparisId = body.siparisId;
  const kalemId   = body.kalemId;
  if (!siparisId) return { hata: 'siparisId gerekli', status: 400 };
  if (!kalemId)   return { hata: 'kalemId gerekli', status: 400 };

  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  const durum = deriveDurum(sip.kalemler, sip.durumOverride);
  if (durum === 'tamamlandi' || durum === 'iptal') {
    return { hata: 'Bu sipariş değiştirilemez', status: 400 };
  }

  const kalem = sip.kalemler.find(k => k.id === kalemId);
  if (!kalem) return { hata: 'Kalem bulunamadı', status: 404 };

  if (body.adet !== undefined) {
    const adet = validateAdet(body.adet);
    if (!adet) return { hata: 'Geçerli adet giriniz (1-99999)', status: 400 };
    if (adet < kalem.karsilanan) {
      return { hata: `Adet karşılanan miktardan (${kalem.karsilanan}) az olamaz`, status: 400 };
    }
    kalem.adet = adet;
  }
  if (body.not !== undefined) {
    kalem.not = stripHtml(body.not).slice(0, 500);
  }

  return { ok: true, siparis: { ...sip, durum: deriveDurum(sip.kalemler, sip.durumOverride) } };
}

// ── İşlem: Sipariş Kalem Sil ───────────────────────────
function handleKalemSil(sipData, body) {
  const siparisId = body.siparisId;
  const kalemId   = body.kalemId;
  if (!siparisId || !kalemId) return { hata: 'siparisId ve kalemId gerekli', status: 400 };

  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  const kalem = sip.kalemler.find(k => k.id === kalemId);
  if (!kalem) return { hata: 'Kalem bulunamadı', status: 404 };
  if (kalem.karsilanan > 0) return { hata: 'Karşılanmış kalem silinemez', status: 400 };

  sip.kalemler = sip.kalemler.filter(k => k.id !== kalemId);

  // Grup boşaldıysa grubu da sil
  if (sip.kalemler.length === 0) {
    sipData.siparisler = sipData.siparisler.filter(s => s.id !== siparisId);
    return { ok: true, grupSilindi: true };
  }

  return { ok: true, siparis: { ...sip, durum: deriveDurum(sip.kalemler, sip.durumOverride) } };
}

// ── CORS Preflight ───────────────────────────────────
function corsHeaders(origin) {
  // Müşteri, admin ve development origin'leri
  const isAllowed = origin === MUSTERI_ORIGIN
    || origin === ADMIN_ORIGIN
    || origin?.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : MUSTERI_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Siparis-PIN, X-Admin-PIN',
    'Access-Control-Max-Age': '86400',
  };
}

function isAdminOrigin(origin) {
  return origin === ADMIN_ORIGIN || origin?.startsWith('http://localhost');
}

// ── Admin PIN doğrulama ──────────────────────────────
// GÜVENLİK: Admin PIN hash'i SADECE Vercel env'de (ADMIN_PIN_HASH)
// musteriler.json'da DEĞİL, client'ta DEĞİL
async function authenticateAdmin(pin) {
  if (!ADMIN_PIN_HASH) return false;
  const hash = await hashPin(pin);
  return hash === ADMIN_PIN_HASH;
}

// ── Admin: Katalog Yayınla ──────────────────────────
// Ana uygulamadan gelen ürün listesini PUBLIC Gist'e yazar
// Yayınlamadan önce mevcut kataloğu _prev olarak yedekler (K6.15)
async function adminKatalogYayinla(body) {
  const { urunler, suppliers, kategoriler } = body;
  if (!Array.isArray(urunler) || urunler.length === 0) {
    return { hata: 'Ürün listesi boş', status: 400 };
  }

  // Ürün validasyonu
  for (const u of urunler) {
    if (!u.kod || !u.ad) return { hata: `Ürün eksik: kod ve ad zorunlu (${u.kod || '?'})`, status: 400 };
    // XSS temizleme (K6.9)
    u.kod = stripHtml(u.kod);
    u.ad = stripHtml(u.ad);
    u.parcaNo = stripHtml(u.parcaNo || '');
    u.supplier = stripHtml(u.supplier || '');
    u.marka = stripHtml(u.marka || '');
    u.kategori = stripHtml(u.kategori || '');
  }

  // Mevcut kataloğu yedekle (K6.15 — yayınlama yedeği)
  try {
    const mevcutKatalog = await gistReadFile(KAT_GIST, 'katalog.json', true);
    if (mevcutKatalog) {
      await gistWriteFile(KAT_GIST, '_prev_katalog.json', mevcutKatalog);
    }
  } catch (err) {
    console.error('Katalog yedekleme hatası (devam ediliyor):', err.message);
    // Yedekleme başarısız olsa da yayınlamaya devam et — veri kaybı riski yok
  }

  const katalog = {
    guncelleme: new Date().toISOString(),
    apiVersion: '2.0',
    suppliers: (suppliers || []).map(s => stripHtml(s)),
    kategoriler: (kategoriler || []).map(k => stripHtml(k)),
    urunler,
  };

  await gistWriteFile(KAT_GIST, 'katalog.json', katalog);

  return {
    ok: true,
    urunSayisi: urunler.length,
    supplierSayisi: katalog.suppliers.length,
    kategoriSayisi: katalog.kategoriler.length,
  };
}

// ── Admin: Müşteri Listesi Güncelle ─────────────────
// PIN hash'leri PRIVATE Gist'te, admin ekler/günceller/siler
async function adminMusterilerGuncelle(body) {
  const { musteriler } = body;
  if (!Array.isArray(musteriler)) {
    return { hata: 'Müşteri listesi geçersiz', status: 400 };
  }

  // Validasyon
  for (const m of musteriler) {
    if (!m.id || !m.ad || !m.pinHash) {
      return { hata: `Müşteri eksik: id, ad, pinHash zorunlu (${m.id || '?'})`, status: 400 };
    }
    m.ad = stripHtml(m.ad);
    // pinHash zaten hex string, XSS riski yok ama validate edelim
    if (!/^[a-f0-9]{64}$/.test(m.pinHash)) {
      return { hata: `Geçersiz PIN hash formatı: ${m.id}`, status: 400 };
    }
  }

  // ID tekrarı kontrolü
  const ids = musteriler.map(m => m.id);
  if (new Set(ids).size !== ids.length) {
    return { hata: 'Müşteri ID\'leri benzersiz olmalı', status: 400 };
  }

  await gistWriteFile(SIP_GIST, 'musteriler.json', musteriler);

  return { ok: true, musteriSayisi: musteriler.length };
}

// ── Admin: Müşteri Fiyat Güncelle ───────────────────
// Müşteriye özel fiyatları PRIVATE Gist'e yazar
async function adminFiyatGuncelle(body) {
  const { musteriId, fiyatlar, oncekiFiyatlar } = body;
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };
  if (!fiyatlar || typeof fiyatlar !== 'object') {
    return { hata: 'fiyatlar objesi gerekli', status: 400 };
  }

  // K6.11: Alış maliyeti, kâr marjı bilgisi ASLA yazılmamalı
  // Sadece satış fiyatı + döviz + sabit flag kabul edilir
  const temizFiyatlar = {};
  for (const [kod, val] of Object.entries(fiyatlar)) {
    if (!val || typeof val !== 'object') continue;
    temizFiyatlar[stripHtml(kod)] = {
      fiyat: parseFloat(val.fiyat) || 0,
      doviz: stripHtml(val.doviz || 'USD'),
      sabit: !!val.sabit,
    };
  }

  const data = {
    guncelleme: new Date().toISOString(),
    fiyatlar: temizFiyatlar,
    oncekiFiyatlar: oncekiFiyatlar || {},
  };

  await gistWriteFile(SIP_GIST, `fiyat_${stripHtml(musteriId)}.json`, data);

  return { ok: true, fiyatSayisi: Object.keys(temizFiyatlar).length };
}

// ── Admin: Hesap Güncelle ───────────────────────────
// Bakiye, açık faturalar, ödeme geçmişi, sipariş geçmişi
// K6.11: SADECE satış fiyatları — alış maliyeti/kâr marjı ASLA
async function adminHesapGuncelle(body) {
  const { musteriId, bakiye, acikFaturalar, sonOdemeler, sipariGecmisi, sikAlinanlar } = body;
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };

  const data = {
    guncelleme: new Date().toISOString(),
  };

  // Bakiye
  if (bakiye && typeof bakiye === 'object') {
    data.bakiye = {
      toplamBorc: parseFloat(bakiye.toplamBorc) || 0,
      toplamAlacak: parseFloat(bakiye.toplamAlacak) || 0,
      net: parseFloat(bakiye.net) || 0,
      doviz: stripHtml(bakiye.doviz || 'USD'),
    };
  }

  // Açık faturalar — K6.11 kontrolü
  if (Array.isArray(acikFaturalar)) {
    data.acikFaturalar = acikFaturalar.map(f => {
      const temiz = {
        no: stripHtml(f.no || ''),
        tarih: f.tarih || '',
        tutar: parseFloat(f.tutar) || 0,
        odenen: parseFloat(f.odenen) || 0,
        kalan: parseFloat(f.kalan) || 0,
        doviz: stripHtml(f.doviz || 'USD'),
      };
      // Kalemler — SADECE satış fiyatı (birimFiyat), maliyet ASLA
      if (Array.isArray(f.kalemler)) {
        temiz.kalemler = f.kalemler.map(k => ({
          urunKod: stripHtml(k.urunKod || ''),
          urunAd: stripHtml(k.urunAd || ''),
          adet: parseInt(k.adet, 10) || 0,
          birimFiyat: parseFloat(k.birimFiyat) || 0,
          toplam: parseFloat(k.toplam) || 0,
          // maliyet, alisFiyati, kar, marj gibi alanlar KASITLI OLARAK YOK
        }));
      }
      return temiz;
    });
  }

  // Son ödemeler
  if (Array.isArray(sonOdemeler)) {
    data.sonOdemeler = sonOdemeler.map(o => ({
      tarih: o.tarih || '',
      tutar: parseFloat(o.tutar) || 0,
      doviz: stripHtml(o.doviz || 'USD'),
      yontem: stripHtml(o.yontem || ''),
      aciklama: stripHtml(o.aciklama || ''),
    }));
  }

  // Sipariş geçmişi
  if (Array.isArray(sipariGecmisi)) {
    data.sipariGecmisi = sipariGecmisi.map(s => ({
      tarih: s.tarih || '',
      kalemler: Array.isArray(s.kalemler) ? s.kalemler.map(k => ({
        urunKod: stripHtml(k.urunKod || ''),
        urunAd: stripHtml(k.urunAd || ''),
        adet: parseInt(k.adet, 10) || 0,
        // birimFiyat ve toplam SADECE satış fiyatı
        ...(k.birimFiyat !== undefined ? { birimFiyat: parseFloat(k.birimFiyat) || 0 } : {}),
        ...(k.toplam !== undefined ? { toplam: parseFloat(k.toplam) || 0 } : {}),
      })) : [],
      toplamTutar: parseFloat(s.toplamTutar) || 0,
      doviz: stripHtml(s.doviz || 'USD'),
    }));
  }

  // Sık alınanlar
  if (Array.isArray(sikAlinanlar)) {
    data.sikAlinanlar = sikAlinanlar.map(k => stripHtml(k)).slice(0, 50);
  }

  await gistWriteFile(SIP_GIST, `hesap_${stripHtml(musteriId)}.json`, data);

  return { ok: true };
}

// ── Admin: Tüm Siparişleri Oku ──────────────────────
// Tüm müşterilerin siparişlerini getirir (Gelen Siparişler paneli için)
async function adminSiparislerOku() {
  // Sipariş Gist'teki tüm dosyaları oku
  const gist = await gistRead(SIP_GIST);
  const files = gist.files || {};
  const tumu = [];

  for (const [filename, file] of Object.entries(files)) {
    if (!filename.startsWith('siparisler_')) continue;

    let content = file.content;
    // Truncated kontrolü
    if (file.truncated && file.raw_url) {
      const raw = await fetch(file.raw_url, { headers: gistHeaders });
      if (raw.ok) content = await raw.text();
    }

    try {
      const data = JSON.parse(content);
      if (data?.siparisler?.length) {
        tumu.push({
          musteriId: data.musteriId,
          musteriAd: data.musteriAd || filename.replace('siparisler_', '').replace('.json', ''),
          siparisler: data.siparisler.map(s => ({
            ...s,
            durum: deriveDurum(s.kalemler || [], s.durumOverride),
          })),
          sonGuncelleme: data.sonGuncelleme,
        });
      }
    } catch { /* bozuk dosya atla */ }
  }

  return { ok: true, musteriler: tumu };
}

// ── Admin: Sipariş Kalem Karşıla ────────────────────
// Müşterinin siparişinde kalem bazlı karsilanan miktarını günceller
async function adminSiparisKarsila(body) {
  const { musteriId, siparisId, kalemId, karsilanan, not } = body;
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };
  if (!siparisId) return { hata: 'siparisId gerekli', status: 400 };
  if (!kalemId)   return { hata: 'kalemId gerekli', status: 400 };

  const miktar = parseInt(karsilanan, 10);
  if (!Number.isInteger(miktar) || miktar < 0) {
    return { hata: 'Geçerli karşılanan miktarı giriniz', status: 400 };
  }

  const sipData = await readSiparisler(musteriId);
  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  const durum = deriveDurum(sip.kalemler, sip.durumOverride);
  if (durum === 'iptal') return { hata: 'İptal edilmiş sipariş karşılanamaz', status: 400 };

  const kalem = sip.kalemler.find(k => k.id === kalemId);
  if (!kalem) return { hata: 'Kalem bulunamadı', status: 404 };

  if (miktar > kalem.adet) {
    return { hata: `Karşılanan (${miktar}) sipariş adedinden (${kalem.adet}) fazla olamaz`, status: 400 };
  }

  // Karşılama kaydı
  kalem.karsilanan = miktar;
  sip.karsilamalar = sip.karsilamalar || [];
  sip.karsilamalar.push({
    tarih: new Date().toISOString(),
    kalemId,
    miktar,
    not: stripHtml(not || ''),
  });

  await writeSiparisler(musteriId, sipData);

  return { ok: true, siparis: { ...sip, durum: deriveDurum(sip.kalemler, sip.durumOverride) } };
}

// ── Admin: Sipariş İptal ────────────────────────────
async function adminSiparisIptal(body) {
  const { musteriId, siparisId, sebep } = body;
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };
  if (!siparisId) return { hata: 'siparisId gerekli', status: 400 };

  const sipData = await readSiparisler(musteriId);
  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  const durum = deriveDurum(sip.kalemler, sip.durumOverride);
  if (durum === 'tamamlandi') return { hata: 'Tamamlanmış sipariş iptal edilemez', status: 400 };

  sip.durumOverride = 'iptal';
  sip.iptalSebep = stripHtml(sebep || '');
  sip.iptalTarih = new Date().toISOString();

  await writeSiparisler(musteriId, sipData);

  return { ok: true, siparis: { ...sip, durum: 'iptal' } };
}

// ── Admin: Sipariş Durum Override ────────────────────
async function adminDurumOverride(body) {
  const { musteriId, siparisId, durumOverride } = body;
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };
  if (!siparisId) return { hata: 'siparisId gerekli', status: 400 };

  // null = override kaldır (otomatik hesaplamaya dön)
  if (durumOverride !== null && !['beklemede', 'iptal'].includes(durumOverride)) {
    return { hata: 'durumOverride: null, "beklemede" veya "iptal" olmalı', status: 400 };
  }

  const sipData = await readSiparisler(musteriId);
  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  sip.durumOverride = durumOverride;

  await writeSiparisler(musteriId, sipData);

  return { ok: true, siparis: { ...sip, durum: deriveDurum(sip.kalemler, sip.durumOverride) } };
}

// ── Ana Handler ──────────────────────────────────────
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const cors = corsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ENV kontrolü
  if (!TOKEN || !SIP_GIST || !KAT_GIST) {
    return res.status(500).json({ hata: 'Sunucu yapılandırma hatası' });
  }

  // IP & Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const rl = rateCheck(ip);
  if (rl === 'banned') return res.status(429).json({ hata: 'Çok fazla hatalı deneme. 15 dakika bekleyin.' });
  if (rl === 'limited') return res.status(429).json({ hata: 'Çok fazla istek. Lütfen bekleyin.' });

  // Health check (PIN'siz GET, parametresiz)
  if (req.method === 'GET' && !req.headers['x-siparis-pin'] && !req.headers['x-admin-pin'] && !req.query.katalog) {
    return res.status(200).json({
      durum: 'aktif',
      versiyon: '2.0.0',
      zaman: new Date().toISOString(),
    });
  }

  // ── Katalog endpoint (PIN gerekmez) ───────────────
  // Müşteri sayfası ürün listesini buradan çeker
  // Rate limit geçerli (brute force koruması yok, sadece istek limiti)
  if (req.method === 'GET' && req.query.katalog === '1') {
    try {
      const katalog = await gistReadFile(KAT_GIST, 'katalog.json', true);
      return res.status(200).json({
        urunler: katalog?.urunler || [],
        suppliers: katalog?.suppliers || [],
        kategoriler: katalog?.kategoriler || [],
        guncelleme: katalog?.guncelleme || null,
        apiVersion: katalog?.apiVersion || '1.0',
      });
    } catch (err) {
      console.error('Katalog okuma hatası:', err.message);
      return res.status(502).json({ hata: 'Katalog yüklenemedi' });
    }
  }

  // ══════════════════════════════════════════════════
  // ══ ADMIN ENDPOINT'LERİ ══════════════════════════
  // ══════════════════════════════════════════════════
  // Admin PIN ayrı header: X-Admin-PIN
  // CORS: Sadece bekilli-stok.vercel.app (+ localhost dev)
  // Rate limit: 3 hatalı → 30 dk ban (müşteriden sıkı)
  const adminPin = req.headers['x-admin-pin'];
  if (adminPin) {
    // Origin kontrolü — admin sadece ana uygulamadan
    if (!isAdminOrigin(origin)) {
      return res.status(403).json({ hata: 'Bu işlem bu kaynaktan yapılamaz' });
    }

    // Admin PIN doğrulama
    let isAdmin;
    try {
      isAdmin = await authenticateAdmin(adminPin);
    } catch (err) {
      console.error('Admin auth hatası:', err.message);
      return res.status(502).json({ hata: 'Kimlik doğrulama servisi hatası' });
    }

    if (!isAdmin) {
      recordFailedAdminPin(ip);
      return res.status(401).json({ hata: 'Geçersiz admin PIN' });
    }

    try {
      // ── Admin GET: Siparişleri oku ──────────────────
      if (req.method === 'GET') {
        const sonuc = await adminSiparislerOku();
        return res.status(200).json(sonuc);
      }

      // ── Admin POST: İşlem yürüt ────────────────────
      if (req.method === 'POST') {
        const body = req.body || {};
        const islem = body.islem;

        const adminIslemler = {
          katalog_yayinla: adminKatalogYayinla,
          musteriler_guncelle: adminMusterilerGuncelle,
          fiyat_guncelle: adminFiyatGuncelle,
          hesap_guncelle: adminHesapGuncelle,
          siparis_karsila: adminSiparisKarsila,
          siparis_iptal: adminSiparisIptal,
          durum_override: adminDurumOverride,
        };

        if (!adminIslemler[islem]) {
          return res.status(400).json({
            hata: `Geçersiz admin işlemi. Beklenen: ${Object.keys(adminIslemler).join(', ')}`,
          });
        }

        const sonuc = await adminIslemler[islem](body);
        if (sonuc.hata) return res.status(sonuc.status || 400).json({ hata: sonuc.hata });
        return res.status(200).json(sonuc);
      }

      return res.status(405).json({ hata: 'Desteklenmeyen metod' });

    } catch (err) {
      console.error('Admin işlem hatası:', err.message);
      // Retry: 1 kez, 2 sn sonra (GitHub 5xx için)
      if (err.message.includes('5')) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          if (req.method === 'GET') {
            const sonuc = await adminSiparislerOku();
            return res.status(200).json(sonuc);
          }
        } catch { /* retry de başarısızsa aşağıya düş */ }
      }
      return res.status(502).json({ hata: 'Admin işlemi sırasında hata oluştu. Tekrar deneyin.' });
    }
  }

  // ══════════════════════════════════════════════════
  // ══ MÜŞTERİ ENDPOINT'LERİ ═══════════════════════
  // ══════════════════════════════════════════════════
  const pin = req.headers['x-siparis-pin'];
  if (!pin) return res.status(401).json({ hata: 'PIN gerekli' });

  let musteri;
  try {
    musteri = await authenticatePin(pin);
  } catch (err) {
    console.error('Auth hatası:', err.message);
    return res.status(502).json({ hata: 'Kimlik doğrulama servisi hatası' });
  }

  if (!musteri) {
    recordFailedPin(ip);
    return res.status(401).json({ hata: 'Geçersiz PIN' });
  }

  const { id: musteriId, ad: musteriAd } = musteri;

  try {
    // ── GET: Siparişleri + fiyatları oku ──────────────
    if (req.method === 'GET') {
      const [sipData, fiyatlar] = await Promise.all([
        readSiparisler(musteriId),
        readFiyatlar(musteriId),
      ]);
      return res.status(200).json({
        musteriId,
        musteriAd,
        siparisler: (sipData.siparisler || []).map(s => ({
          ...s,
          durum: deriveDurum(s.kalemler || [], s.durumOverride),
        })),
        fiyatlar,
      });
    }

    // ── POST: Sipariş işlemi ────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {};
      const islem = body.islem;

      if (!['ekle', 'sil', 'guncelle', 'kalem_sil'].includes(islem)) {
        return res.status(400).json({ hata: 'Geçersiz işlem. Beklenen: ekle, sil, guncelle, kalem_sil' });
      }

      // Sipariş dosyasını oku
      const sipData = await readSiparisler(musteriId);
      sipData.musteriId = musteriId;
      sipData.musteriAd = musteriAd;

      // İşlem yürüt
      let sonuc;
      if (islem === 'ekle')      sonuc = handleEkle(sipData, body);
      if (islem === 'sil')       sonuc = handleSil(sipData, body);
      if (islem === 'guncelle')  sonuc = handleGuncelle(sipData, body);
      if (islem === 'kalem_sil') sonuc = handleKalemSil(sipData, body);

      if (sonuc.hata) return res.status(sonuc.status || 400).json({ hata: sonuc.hata });

      // Gist'e yaz
      await writeSiparisler(musteriId, sipData);

      return res.status(200).json({
        ok: true,
        islem,
        siparis: sonuc.siparis || undefined,
        toplamSiparis: sipData.siparisler.length,
      });
    }

    return res.status(405).json({ hata: 'Desteklenmeyen metod' });

  } catch (err) {
    console.error('İşlem hatası:', err.message);
    // Retry: 1 kez, 2 sn sonra (GitHub 5xx için)
    if (err.message.includes('5')) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        // Basit retry — sadece okuma işlemi için
        if (req.method === 'GET') {
          const sipData = await readSiparisler(musteriId);
          return res.status(200).json({ musteriId, musteriAd, siparisler: (sipData.siparisler || []).map(s => ({ ...s, durum: deriveDurum(s.kalemler || [], s.durumOverride) })) });
        }
      } catch { /* retry de başarısızsa aşağıya düş */ }
    }
    return res.status(502).json({ hata: 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.' });
  }
}
