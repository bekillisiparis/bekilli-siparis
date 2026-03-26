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

async function gistWriteFile(gistId, filename, data, _retries = 0) {
  const res = await fetch(`${GIST_API}/${gistId}`, {
    method: 'PATCH',
    headers: { ...gistHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: { [filename]: { content: JSON.stringify(data) } }
    }),
  });
  if (!res.ok) {
    // 409 Conflict: Eşzamanlı yazım çakışması — 1sn bekle, 2 kez dene
    if (res.status === 409 && _retries < 2) {
      await new Promise(r => setTimeout(r, 1000 + _retries * 500));
      return gistWriteFile(gistId, filename, data, _retries + 1);
    }
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
  if (hepsiTamam) return 'tamamlandi';
  // M2: Taslak fatura hazırlanıyorsa → "hazırlaniyor" durumu
  // hicKarsilanmamis: hiç karşılama yapılmamış (ama hazırlanan olabilir)
  const hicKarsilanmamis = kalemler.every(k => k.karsilanan === 0);
  const hazırlananVar = kalemler.some(k => (k.hazirlanan || 0) > 0 && k.karsilanan < k.adet);
  if (hazırlananVar && hicKarsilanmamis) return 'hazirlaniyor';
  if (hicKarsilanmamis) return 'beklemede';
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
// Önce Gist'teki dinamik hash'e bak (PIN Değiştir ile güncellenir)
// Yoksa Vercel env ADMIN_PIN_HASH'e fallback (ilk kurulum)
let _cachedAdminHash = null; // cold start'ta null, ilk auth'ta Gist'ten okunur
async function getAdminHash() {
  if (_cachedAdminHash) return _cachedAdminHash;
  try {
    const stored = await gistReadFile(SIP_GIST, 'admin_config.json');
    if (stored?.pinHash) { _cachedAdminHash = stored.pinHash; return _cachedAdminHash; }
  } catch (e) { console.warn("getAdminHash Gist okunamadı, env fallback:", e.message); }
  _cachedAdminHash = ADMIN_PIN_HASH || null;
  return _cachedAdminHash;
}
async function authenticateAdmin(pin) {
  const targetHash = await getAdminHash();
  if (!targetHash) return false;
  const hash = await hashPin(pin);
  return hash === targetHash;
}

// ── Admin: PIN Değiştir ─────────────────────────────
// CloudSync PinDegistir'den çağrılır. Yeni hash'i Gist'e yazar.
async function adminPinGuncelle(body) {
  const { yeniHash } = body;
  if (!yeniHash || !/^[a-f0-9]{64}$/.test(yeniHash)) {
    return { hata: 'Geçerli SHA-256 hash gerekli', status: 400 };
  }
  await gistWriteFile(SIP_GIST, 'admin_config.json', { pinHash: yeniHash, guncelleme: new Date().toISOString() });
  _cachedAdminHash = yeniHash; // cache güncelle
  return { ok: true };
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
    if (!m.id || !m.ad) {
      return { hata: `Müşteri eksik: id ve ad zorunlu (${m.id || '?'})`, status: 400 };
    }
    m.ad = stripHtml(m.ad);
    // firmaId — ana uygulamadaki müşteri bağlantısı
    if (m.firmaId) m.firmaId = stripHtml(m.firmaId);
    // M6: pinHash opsiyonel — null/absent = müşteri portala login edemez ama veri sync çalışır
    if (m.pinHash) {
      if (!/^[a-f0-9]{64}$/.test(m.pinHash)) {
        return { hata: `Geçersiz PIN hash formatı: ${m.id}`, status: 400 };
      }
    } else {
      m.pinHash = null; // normalize: undefined → null
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
  const { musteriId, bakiye, acikFaturalar, sonOdemeler, sipariGecmisi, sikAlinanlar,
          kapananFaturalar, yeniBildirimler } = body;
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };

  // Mevcut hesap verisi oku (bildirim merge için)
  const sanitizedId = stripHtml(musteriId);
  let mevcutData = {};
  try {
    mevcutData = await gistReadFile(SIP_GIST, `hesap_${sanitizedId}.json`) || {};
  } catch (e) { /* ilk yazım, dosya yok */ }

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

  // Açık faturalar — K6.11 kontrolü (zenginleştirilmiş alanlar)
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
      // Portal v3 zengin alanlar
      if (f.faturaId)     temiz.faturaId = stripHtml(f.faturaId);
      if (f.orijinalDoviz && f.orijinalDoviz !== 'USD') {
        temiz.orijinalDoviz = stripHtml(f.orijinalDoviz);
        temiz.orijinalTutar = parseFloat(f.orijinalTutar) || 0;
        temiz.orijinalKur   = parseFloat(f.orijinalKur) || 0;
      }
      if (parseFloat(f.kdvOrani) > 0) {
        temiz.kdvOrani = parseFloat(f.kdvOrani);
        temiz.kdvTutar = parseFloat(f.kdvTutar) || 0;
      }
      if (f.gecikmeGun !== undefined && f.gecikmeGun !== null) {
        temiz.gecikmeGun = parseInt(f.gecikmeGun, 10) || 0;
      }
      // Kalemler — SADECE satış fiyatı (birimFiyat), maliyet ASLA
      if (Array.isArray(f.kalemler)) {
        temiz.kalemler = f.kalemler.map(k => ({
          urunKod: stripHtml(k.urunKod || ''),
          urunAd: stripHtml(k.urunAd || ''),
          adet: parseInt(k.adet, 10) || 0,
          birimFiyat: parseFloat(k.birimFiyat) || 0,
          toplam: parseFloat(k.toplam) || 0,
          // adminNot: müşteriye yönelik kalem notu (K6.11 kapsamı dışında)
          ...(k.not ? { not: stripHtml(k.not).slice(0, 300) } : {}),
          // maliyet, alisFiyati, kar, marj, aciklama KASITLI OLARAK YOK (K6.11)
        }));
      }
      return temiz;
    });
  }

  // Kapanan faturalar (son 20 özet)
  if (Array.isArray(kapananFaturalar)) {
    data.kapananFaturalar = kapananFaturalar.slice(-20).map(f => ({
      no: stripHtml(f.no || ''),
      tarih: f.tarih || '',
      tutar: parseFloat(f.tutar) || 0,
      doviz: stripHtml(f.doviz || 'USD'),
      ...(parseFloat(f.kdvOrani) > 0 ? { kdvOrani: parseFloat(f.kdvOrani), kdvTutar: parseFloat(f.kdvTutar) || 0 } : {}),
      ...(Array.isArray(f.kalemler) ? { kalemler: f.kalemler.map(k => ({
        urunKod: stripHtml(k.urunKod || ''), urunAd: stripHtml(k.urunAd || ''),
        adet: parseInt(k.adet, 10) || 0, birimFiyat: parseFloat(k.birimFiyat) || 0,
        toplam: parseFloat(k.toplam) || 0,
        ...(k.not ? { not: stripHtml(k.not).slice(0, 300) } : {}),
      })) } : {}),
    }));
  }

  // Son ödemeler (tahsilatlar + mahsuplaşmalar, FIFO eşleşme detaylı)
  if (Array.isArray(sonOdemeler)) {
    data.sonOdemeler = sonOdemeler.map(o => ({
      tarih: o.tarih || '',
      tutar: parseFloat(o.tutar) || 0,
      doviz: stripHtml(o.doviz || 'USD'),
      ...(o.orijinalTutar ? { orijinalTutar: parseFloat(o.orijinalTutar) || 0 } : {}),
      yontem: stripHtml(o.yontem || ''),
      tip: stripHtml(o.tip || 'tahsilat'), // tahsilat | mahsup
      // FIFO eşleşme: hangi faturayı ne kadar kapattı
      ...(Array.isArray(o.eslesmeler) && o.eslesmeler.length > 0 ? {
        eslesmeler: o.eslesmeler.map(e => ({
          faturaNo: stripHtml(e.faturaNo || ''),
          kapatilan: parseFloat(e.kapatilan) || 0,
        })),
      } : {}),
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

  // Bekleyen iadeler (mahsuplaştırılmamış iade alacakları)
  if (Array.isArray(body.bekleyenIadeler)) {
    data.bekleyenIadeler = body.bekleyenIadeler.map(f => ({
      no: stripHtml(f.no || ''),
      tarih: f.tarih || '',
      tutar: parseFloat(f.tutar) || 0,
      doviz: stripHtml(f.doviz || 'USD'),
      aciklama: stripHtml(f.aciklama || ''),
      // Kalemler — satış fiyatı, maliyet ASLA (K6.11)
      ...(Array.isArray(f.kalemler) ? {
        kalemler: f.kalemler.map(k => ({
          urunKod: stripHtml(k.urunKod || ''),
          urunAd: stripHtml(k.urunAd || ''),
          adet: parseInt(k.adet, 10) || 0,
          toplam: parseFloat(k.toplam) || 0,
        })),
      } : {}),
    }));
  }

  // Sık alınanlar
  if (Array.isArray(sikAlinanlar)) {
    data.sikAlinanlar = sikAlinanlar.map(k => stripHtml(k)).slice(0, 50);
  }

  // Bildirimler — yenileri mevcut listeye append et, son 50 FIFO
  const mevcutBildirimler = Array.isArray(mevcutData.bildirimler) ? mevcutData.bildirimler : [];
  if (Array.isArray(yeniBildirimler) && yeniBildirimler.length > 0) {
    const sanitized = yeniBildirimler.map(b => ({
      id: stripHtml(b.id || ''),
      tarih: b.tarih || new Date().toISOString(),
      tip: stripHtml(b.tip || ''),
      mesaj: stripHtml(b.mesaj || '').slice(0, 200),
      ref: stripHtml(b.ref || ''),
      okundu: false,
    }));
    data.bildirimler = [...mevcutBildirimler, ...sanitized].slice(-50);
  } else {
    // Bildirim eklenmese bile mevcut bildirimleri koru
    data.bildirimler = mevcutBildirimler;
  }

  await gistWriteFile(SIP_GIST, `hesap_${sanitizedId}.json`, data);

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
    } catch (e) { console.warn("Sipariş dosyası parse hatası:", e.message); }
  }

  return { ok: true, musteriler: tumu };
}

// ── Admin: Katalog Stok Güncelle ─────────────────────
// Tüm katalog yeniden yayınlamadan sadece stokVar alanlarını günceller.
// afterTransaction hook'ları (alış/satış/iade) tarafından fire-and-forget çağrılır.
// guncellemeler: [{ kod, stokVar, parcaNo?, ad?, supplier?, marka?, kategori? }]
// Upsert: tam bilgi varsa yeni ürün eklenir, yoksa sadece stokVar güncellenir.
async function adminKatalogStokGuncelle(body) {
  const { guncellemeler } = body;
  if (!Array.isArray(guncellemeler) || guncellemeler.length === 0) {
    return { hata: 'guncellemeler dizisi boş veya geçersiz', status: 400 };
  }

  // Validasyon
  for (const g of guncellemeler) {
    if (!g.kod || typeof g.stokVar !== 'boolean') {
      return { hata: `Geçersiz güncelleme: kod ve stokVar(boolean) zorunlu (${g.kod || '?'})`, status: 400 };
    }
    g.kod = stripHtml(g.kod);
    if (g.parcaNo) g.parcaNo = stripHtml(g.parcaNo);
    if (g.ad) g.ad = stripHtml(g.ad);
    if (g.supplier) g.supplier = stripHtml(g.supplier);
    if (g.marka) g.marka = stripHtml(g.marka);
    if (g.kategori) g.kategori = stripHtml(g.kategori);
  }

  const katalog = await gistReadFile(KAT_GIST, 'katalog.json', true);
  if (!katalog || !Array.isArray(katalog.urunler)) {
    return { hata: 'Katalog bulunamadı. Önce Katalog Yayınla yapın.', status: 404 };
  }

  // Mevcut ürünleri kod bazlı map'e al
  const mevcutKodMap = new Set(katalog.urunler.map(u => u.kod));
  let degisen = 0;
  let eklenen = 0;

  // Mevcut ürünlerin tüm alanlarını güncelle (upsert)
  katalog.urunler = katalog.urunler.map(u => {
    const g = guncellemeler.find(x => x.kod === u.kod);
    if (!g) return u;
    const updated = { ...u, stokVar: g.stokVar };
    // Gelen bilgi varsa güncelle (boş/undefined gelirse eskiyi koru)
    if (g.ad) updated.ad = g.ad;
    if (g.parcaNo) updated.parcaNo = g.parcaNo;
    if (g.supplier) updated.supplier = g.supplier;
    if (g.marka) updated.marka = g.marka;
    if (g.kategori) updated.kategori = g.kategori;
    // Herhangi bir alan değiştiyse say
    if (JSON.stringify(u) !== JSON.stringify(updated)) degisen++;
    return updated;
  });

  // Yeni ürünler: katalogda olmayan + tam bilgisi gelen
  for (const g of guncellemeler) {
    if (mevcutKodMap.has(g.kod)) continue; // zaten güncellendi
    if (!g.ad) continue; // ad yoksa ekleme yapamayız (sadece stokVar güncellemesi istenmiş)
    katalog.urunler.push({
      kod: g.kod,
      parcaNo: g.parcaNo || g.kod,
      ad: g.ad,
      supplier: g.supplier || '',
      marka: g.marka || '',
      kategori: g.kategori || '',
      stokVar: g.stokVar,
    });
    eklenen++;
  }

  // Suppliers ve kategoriler setini güncelle (yeni + değişen ürünlerden gelen değerler)
  if (eklenen > 0 || degisen > 0) {
    const suppliersSet = new Set(katalog.suppliers || []);
    const kategorilerSet = new Set(katalog.kategoriler || []);
    for (const u of katalog.urunler) {
      if (u.supplier) suppliersSet.add(u.supplier);
      if (u.kategori) kategorilerSet.add(u.kategori);
    }
    katalog.suppliers = [...suppliersSet].sort();
    katalog.kategoriler = [...kategorilerSet].sort();
  }

  if (degisen === 0 && eklenen === 0) {
    return { ok: true, degisen: 0, eklenen: 0, mesaj: 'Katalog zaten güncel' };
  }

  katalog.guncelleme = new Date().toISOString();
  await gistWriteFile(KAT_GIST, 'katalog.json', katalog);

  return { ok: true, degisen, eklenen, toplam: guncellemeler.length };
}

// ── Admin: Sipariş Kalem Karşıla ────────────────────
// Müşterinin siparişinde kalem bazlı karsilanan miktarını günceller
async function adminSiparisKarsila(body) {
  const { musteriId, siparisId, kalemId, karsilanan, not, fiyat, doviz } = body;
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
  // Kesinleşme: taslak→kesin geçişte hazirlanan temizlenir
  if (kalem.hazirlanan) kalem.hazirlanan = 0;

  sip.karsilamalar = sip.karsilamalar || [];
  const karsilamaKayit = {
    tarih: new Date().toISOString(),
    kalemId,
    miktar,
    fiyat: parseFloat(fiyat) || null,     // birim satış fiyatı — B2 TakipTab + F1 hesap için
    doviz: stripHtml(doviz || 'USD'),      // fiyatın dövizi
    not: stripHtml(not || ''),
  };
  // M11: Muadil ürün bilgisi (orijinal ürün yerine farklı supplier gönderildiğinde)
  if (body.muadilKod) karsilamaKayit.muadilKod = stripHtml(body.muadilKod);
  if (body.muadilAd)  karsilamaKayit.muadilAd  = stripHtml(body.muadilAd);
  sip.karsilamalar.push(karsilamaKayit);

  await writeSiparisler(musteriId, sipData);

  return { ok: true, siparis: { ...sip, durum: deriveDurum(sip.kalemler, sip.durumOverride) } };
}

// ── Admin: Sipariş Karşılama Düşür (İade / Geri Alma) ────────────
// Bir kalemin karsilanan miktarını düşürür. İade veya yanlışlık düzeltme için.
async function adminSiparisKarsilamaDusur(body) {
  const { musteriId, siparisId, kalemId, dusurMiktar, sebep, tip } = body;
  if (!musteriId)  return { hata: 'musteriId gerekli', status: 400 };
  if (!siparisId)  return { hata: 'siparisId gerekli', status: 400 };
  if (!kalemId)    return { hata: 'kalemId gerekli', status: 400 };

  const miktar = parseInt(dusurMiktar, 10);
  if (!Number.isInteger(miktar) || miktar <= 0) {
    return { hata: 'Düşürülecek miktar 1 veya daha fazla olmalı', status: 400 };
  }

  const sipData = await readSiparisler(musteriId);
  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  const kalem = sip.kalemler.find(k => k.id === kalemId);
  if (!kalem) return { hata: 'Kalem bulunamadı', status: 404 };

  if (miktar > (kalem.karsilanan || 0)) {
    return { hata: `Düşürülecek miktar (${miktar}) mevcut karşılanandan (${kalem.karsilanan || 0}) fazla olamaz`, status: 400 };
  }

  // Karşılama düşür
  kalem.karsilanan = (kalem.karsilanan || 0) - miktar;

  // Log kaydı
  sip.karsilamalar = sip.karsilamalar || [];
  sip.karsilamalar.push({
    tarih: new Date().toISOString(),
    kalemId,
    miktar: -miktar,
    tip: tip || 'iade', // "iade" veya "duzeltme"
    sebep: stripHtml(sebep || ''),
  });

  await writeSiparisler(musteriId, sipData);

  return { ok: true, siparis: { ...sip, durum: deriveDurum(sip.kalemler, sip.durumOverride) } };
}

// ── Admin: Sipariş İade Bildir ────────────────────────
// Seçenek B: karsilanan DÜŞMEZ. Kalem altında iadeler[] array'ine entry ekler.
// Gelecek genişleme için tasarlanmış:
//   - hareketId: ana uygulamadaki iade hareketinin ID'si (fatura/hesap sistemi köprüsü)
//   - tip: "iade" | "kayip" | "hasar" (ileride yeni tipler eklenebilir)
//   - sonrakiAdimlar response alanı: caller'a ne yapması gerektiğini söyler
//     (stok sync, hesap güncelleme vb. — şimdilik boş, hook'lar büyüdükçe dolar)
async function adminSiparisIadeBildir(body) {
  const { musteriId, siparisId, kalemId, miktar, sebep, tip, hareketId } = body;
  if (!musteriId)  return { hata: 'musteriId gerekli', status: 400 };
  if (!siparisId)  return { hata: 'siparisId gerekli', status: 400 };
  if (!kalemId)    return { hata: 'kalemId gerekli', status: 400 };

  const iadeMiktar = parseInt(miktar, 10);
  if (!Number.isInteger(iadeMiktar) || iadeMiktar <= 0) {
    return { hata: 'İade miktarı 1 veya daha fazla olmalı', status: 400 };
  }

  const geçerliTipler = ['iade', 'kayip', 'hasar'];
  const iadeTip = geçerliTipler.includes(tip) ? tip : 'iade';

  const sipData = await readSiparisler(musteriId);
  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  const kalem = sip.kalemler.find(k => k.id === kalemId);
  if (!kalem) return { hata: 'Kalem bulunamadı', status: 404 };

  // Validasyon: iade ≤ karsilanan
  const mevcutIade = (kalem.iadeler || []).reduce((s, i) => s + (i.miktar || 0), 0);
  if (iadeMiktar > (kalem.karsilanan || 0) - mevcutIade) {
    return {
      hata: `İade miktarı (${iadeMiktar}), net karşılanan miktarı (${(kalem.karsilanan||0) - mevcutIade}) aşamaz`,
      status: 400,
    };
  }

  // kalem.iadeler[] array'ine ekle — karsilanan DEĞİŞMEZ (Seçenek B)
  kalem.iadeler = kalem.iadeler || [];
  kalem.iadeler.push({
    id: `iade-${Date.now()}`,       // ileride referans için
    tarih: new Date().toISOString(),
    miktar: iadeMiktar,
    sebep: stripHtml(sebep || ''),
    tip: iadeTip,
    hareketId: hareketId || null,   // ana uygulama iade hareketi ID'si — fatura köprüsü
  });

  // hasIade flag: TakipTab'da uyarı badge için hızlı erişim
  sip.hasIade = sip.kalemler.some(k => (k.iadeler || []).length > 0);

  await writeSiparisler(musteriId, sipData);

  // sonrakiAdimlar: caller hook sistemi büyüdükçe buraya eklenecek
  // Şu an boş — B1 (stok sync), F1 (hesap güncel) gibi adımlar ileride buradan yönetilecek
  return {
    ok: true,
    siparis: { ...sip, durum: deriveDurum(sip.kalemler, sip.durumOverride) },
    sonrakiAdimlar: [],
  };
}

// ── Admin: Sipariş Hazırlanıyor (Taslak fatura → sipariş bildirimi) ──
// M2: Taslak fatura oluşturulduğunda, müşterinin sipariş kaleminde hazirlanan alanını set eder.
// Müşteri portalında "Hazırlanıyor" durumu görünür (M4).
// Geriden başlayarak eşleştirilir — aynı ürün birden fazla siparişte varsa en yeni önce.
async function adminSiparisHazirlaniyor(body) {
  const { musteriId, kalemler } = body;
  // kalemler: [{ siparisId, kalemId, hazirlanan }]
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };
  if (!Array.isArray(kalemler) || kalemler.length === 0) {
    return { hata: 'kalemler dizisi boş veya geçersiz', status: 400 };
  }

  const sipData = await readSiparisler(musteriId);
  let guncellenen = 0;

  for (const k of kalemler) {
    if (!k.siparisId || !k.kalemId) continue;
    const miktar = parseInt(k.hazirlanan, 10);
    if (!Number.isInteger(miktar) || miktar < 0) continue;

    const sip = sipData.siparisler.find(s => s.id === k.siparisId);
    if (!sip) continue;

    const durum = deriveDurum(sip.kalemler, sip.durumOverride);
    if (durum === 'iptal' || durum === 'tamamlandi') continue;

    const kalem = sip.kalemler.find(kk => kk.id === k.kalemId);
    if (!kalem) continue;

    // hazirlanan ≤ (adet - karsilanan) — zaten karşılanan kısmı hazırlamaya gerek yok
    const maxHazir = kalem.adet - (kalem.karsilanan || 0);
    kalem.hazirlanan = Math.min(miktar, maxHazir);
    guncellenen++;
  }

  if (guncellenen === 0) {
    return { ok: true, guncellenen: 0, mesaj: 'Güncellenecek kalem yok' };
  }

  await writeSiparisler(musteriId, sipData);
  return { ok: true, guncellenen };
}

// ── Admin: Sipariş Hazırlama Düşür (Taslak iptal/silindiğinde) ───────
// E4: Taslak fatura silinirse hazırlanan geri düşürülür.
async function adminSiparisHazirlamaDusur(body) {
  const { musteriId, kalemler } = body;
  // kalemler: [{ siparisId, kalemId, dusurMiktar }]
  if (!musteriId) return { hata: 'musteriId gerekli', status: 400 };
  if (!Array.isArray(kalemler) || kalemler.length === 0) {
    return { hata: 'kalemler dizisi boş veya geçersiz', status: 400 };
  }

  const sipData = await readSiparisler(musteriId);
  let guncellenen = 0;

  for (const k of kalemler) {
    if (!k.siparisId || !k.kalemId) continue;
    const miktar = parseInt(k.dusurMiktar, 10);
    if (!Number.isInteger(miktar) || miktar <= 0) continue;

    const sip = sipData.siparisler.find(s => s.id === k.siparisId);
    if (!sip) continue;

    const kalem = sip.kalemler.find(kk => kk.id === k.kalemId);
    if (!kalem) continue;

    kalem.hazirlanan = Math.max(0, (kalem.hazirlanan || 0) - miktar);
    guncellenen++;
  }

  if (guncellenen === 0) {
    return { ok: true, guncellenen: 0, mesaj: 'Güncellenecek kalem yok' };
  }

  await writeSiparisler(musteriId, sipData);
  return { ok: true, guncellenen };
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
      // ── Admin GET: Veri oku ────────────────────────────
      if (req.method === 'GET') {
        const veri = req.query.veri;
        if (veri === 'musteriler') {
          const musteriler = await gistReadFile(SIP_GIST, 'musteriler.json');
          return res.status(200).json({ ok: true, musteriler: musteriler || [] });
        }
        if (veri === 'fiyat' && req.query.musteri) {
          // Belirli müşterinin portal fiyatlarını oku
          const fData = await gistReadFile(SIP_GIST, `fiyat_${req.query.musteri}.json`);
          return res.status(200).json({ ok: true, fiyatlar: fData || {} });
        }
        if (veri === 'hesap' && req.query.musteri) {
          // Belirli müşterinin hesap/bakiye bilgisini oku
          const hData = await gistReadFile(SIP_GIST, `hesap_${req.query.musteri}.json`);
          return res.status(200).json({ ok: true, hesap: hData || {} });
        }
        if (veri === 'tum_fiyatlar') {
          // Tüm portal müşterilerinin fiyatlarını tek seferde oku
          const gist = await gistRead(SIP_GIST);
          const files = gist.files || {};
          const tumu = {};
          for (const [filename, file] of Object.entries(files)) {
            if (!filename.startsWith('fiyat_')) continue;
            const mid = filename.replace('fiyat_', '').replace('.json', '');
            let content = file.content;
            if (file.truncated && file.raw_url) {
              const raw = await fetch(file.raw_url, { headers: gistHeaders });
              if (raw.ok) content = await raw.text();
            }
            try { tumu[mid] = JSON.parse(content); } catch (e) { console.warn("Fiyat dosyası parse hatası:", mid, e.message); }
          }
          return res.status(200).json({ ok: true, fiyatlar: tumu });
        }
        // Varsayılan: siparişleri oku
        const sonuc = await adminSiparislerOku();
        return res.status(200).json(sonuc);
      }

      // ── Admin POST: İşlem yürüt ────────────────────
      if (req.method === 'POST') {
        const body = req.body || {};
        const islem = body.islem;

        const adminIslemler = {
          katalog_yayinla: adminKatalogYayinla,
          katalog_stok_guncelle: adminKatalogStokGuncelle,
          musteriler_guncelle: adminMusterilerGuncelle,
          fiyat_guncelle: adminFiyatGuncelle,
          hesap_guncelle: adminHesapGuncelle,
          siparis_karsila: adminSiparisKarsila,
          siparis_karsilama_dusur: adminSiparisKarsilamaDusur,
          siparis_iade_bildir: adminSiparisIadeBildir,
          siparis_hazirlaniyor: adminSiparisHazirlaniyor,
          siparis_hazirlaniyor_dusur: adminSiparisHazirlamaDusur,
          siparis_iptal: adminSiparisIptal,
          durum_override: adminDurumOverride,
          admin_pin_guncelle: adminPinGuncelle,
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
        } catch (e) { console.warn("Admin retry de başarısız:", e.message); }
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
    // ── GET: Siparişleri + fiyatları + hesap bilgisi oku ──────────────
    if (req.method === 'GET') {
      const [sipData, fiyatlar, hesapData] = await Promise.all([
        readSiparisler(musteriId),
        readFiyatlar(musteriId),
        gistReadFile(SIP_GIST, `hesap_${musteriId}.json`).catch(() => null),
      ]);
      return res.status(200).json({
        musteriId,
        musteriAd,
        siparisler: (sipData.siparisler || []).map(s => ({
          ...s,
          durum: deriveDurum(s.kalemler || [], s.durumOverride),
        })),
        fiyatlar,
        hesap: hesapData || null,
      });
    }

    // ── POST: Sipariş işlemi ────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {};
      const islem = body.islem;

      if (!['ekle', 'sil', 'guncelle', 'kalem_sil', 'bildirim_okundu'].includes(islem)) {
        return res.status(400).json({ hata: 'Geçersiz işlem. Beklenen: ekle, sil, guncelle, kalem_sil, bildirim_okundu' });
      }

      // ── Bildirim okundu işaretle ────────────────────
      if (islem === 'bildirim_okundu') {
        const { bildirimIds } = body;
        if (!Array.isArray(bildirimIds) || bildirimIds.length === 0) {
          return res.status(400).json({ hata: 'bildirimIds dizisi gerekli' });
        }
        const hesapData = await gistReadFile(SIP_GIST, `hesap_${musteriId}.json`).catch(() => null);
        if (!hesapData || !Array.isArray(hesapData.bildirimler)) {
          return res.status(200).json({ ok: true }); // veri yok, sessizce başarılı
        }
        const idSet = new Set(bildirimIds.map(id => stripHtml(id)));
        hesapData.bildirimler = hesapData.bildirimler.map(b =>
          idSet.has(b.id) ? { ...b, okundu: true } : b
        );
        hesapData.guncelleme = new Date().toISOString();
        await gistWriteFile(SIP_GIST, `hesap_${musteriId}.json`, hesapData);
        return res.status(200).json({ ok: true });
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
      } catch (e) { console.warn("Müşteri retry de başarısız:", e.message); }
    }
    return res.status(502).json({ hata: 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.' });
  }
}
