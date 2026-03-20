// /api/siparis.js — Bekilli Sipariş Sistemi Vercel Serverless Function
// Müşteri: PIN ile auth → sipariş ekle/sil/güncelle/oku
// Gist: Katalog (public) + Sipariş (private, müşteri başına dosya)

import { createHash, randomUUID } from 'crypto';

// ── ENV ──────────────────────────────────────────────
const TOKEN      = process.env.SIPARIS_GIST_TOKEN;
const SIP_GIST   = process.env.SIPARIS_GIST_ID;
const KAT_GIST   = process.env.KATALOG_GIST_ID;
const ALLOWED_ORIGIN = 'https://bekilli-siparis.vercel.app';

// ── Rate Limit (in-memory, cold start'ta sıfırlanır) ─
const ipHits = {};
const IP_LIMIT = 30;
const IP_BAN_LIMIT = 5;
const IP_BAN_MINUTES = 15;
const ipBans = {};

function rateCheck(ip) {
  const now = Date.now();
  if (ipBans[ip] && now < ipBans[ip]) return 'banned';
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

async function gistRead(gistId) {
  const res = await fetch(`${GIST_API}/${gistId}`, { headers: gistHeaders });
  if (!res.ok) throw new Error(`Gist okuma hatası: ${res.status}`);
  return res.json();
}

async function gistReadFile(gistId, filename) {
  const gist = await gistRead(gistId);
  const file = gist.files?.[filename];
  if (!file) return null;
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers: gistHeaders });
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
async function authenticatePin(pin) {
  const hash = await hashPin(pin);
  const katalog = await gistReadFile(KAT_GIST, 'katalog.json');
  if (!katalog?.musteriler?.length) return null;
  const musteri = katalog.musteriler.find(m => m.pinHash === hash);
  return musteri || null;
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

// ── İşlem: Sipariş Ekle ─────────────────────────────
function handleEkle(sipData, body) {
  const urunKod = validateText(body.urunKod, 100);
  const urunAd  = validateText(body.urunAd, 200);
  const adet    = validateAdet(body.adet);
  const not     = stripHtml(body.not || '').slice(0, 500);

  if (!urunKod) return { hata: 'Ürün kodu gerekli', status: 400 };
  if (!adet)    return { hata: 'Geçerli adet giriniz (1-99999)', status: 400 };

  const yeniUrun = !!body.yeniUrun;
  const siparis = {
    id: randomUUID(),
    urunKod,
    urunAd: urunAd || urunKod,
    adet,
    karsilanan: 0,
    fiyat: null,
    doviz: null,
    durum: 'beklemede',
    tarih: new Date().toISOString(),
    not,
    karsilamalar: [],
  };

  if (yeniUrun) {
    siparis.yeniUrun = true;
    siparis.parcaNo  = validateText(body.parcaNo, 50) || '';
    siparis.supplier = validateText(body.supplier, 50) || '';
    siparis.kategori = validateText(body.kategori, 50) || '';
  }

  sipData.siparisler.push(siparis);
  return { ok: true, siparis };
}

// ── İşlem: Sipariş Sil ──────────────────────────────
function handleSil(sipData, body) {
  const siparisId = body.siparisId;
  if (!siparisId) return { hata: 'siparisId gerekli', status: 400 };

  const idx = sipData.siparisler.findIndex(s => s.id === siparisId);
  if (idx === -1) return { hata: 'Sipariş bulunamadı', status: 404 };

  const sip = sipData.siparisler[idx];
  if (sip.karsilanan > 0) return { hata: 'Karşılanmış sipariş silinemez', status: 400 };

  sipData.siparisler.splice(idx, 1);
  return { ok: true };
}

// ── İşlem: Sipariş Güncelle (adet/not) ──────────────
function handleGuncelle(sipData, body) {
  const siparisId = body.siparisId;
  if (!siparisId) return { hata: 'siparisId gerekli', status: 400 };

  const sip = sipData.siparisler.find(s => s.id === siparisId);
  if (!sip) return { hata: 'Sipariş bulunamadı', status: 404 };

  if (sip.durum === 'tamamlandi' || sip.durum === 'iptal') {
    return { hata: 'Bu sipariş değiştirilemez', status: 400 };
  }

  if (body.adet !== undefined) {
    const adet = validateAdet(body.adet);
    if (!adet) return { hata: 'Geçerli adet giriniz (1-99999)', status: 400 };
    if (adet < sip.karsilanan) return { hata: `Adet karşılanan miktardan (${sip.karsilanan}) az olamaz`, status: 400 };
    sip.adet = adet;
  }
  if (body.not !== undefined) {
    sip.not = stripHtml(body.not).slice(0, 500);
  }

  return { ok: true, siparis: sip };
}

// ── CORS Preflight ───────────────────────────────────
function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN || origin?.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Siparis-PIN',
    'Access-Control-Max-Age': '86400',
  };
}

// ── Ana Handler ──────────────────────────────────────
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const cors = corsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!TOKEN || !SIP_GIST || !KAT_GIST) {
    return res.status(500).json({ hata: 'Sunucu yapılandırma hatası' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const rl = rateCheck(ip);
  if (rl === 'banned') return res.status(429).json({ hata: 'Çok fazla hatalı deneme. 15 dakika bekleyin.' });
  if (rl === 'limited') return res.status(429).json({ hata: 'Çok fazla istek. Lütfen bekleyin.' });

  if (req.method === 'GET' && !req.headers['x-siparis-pin']) {
    return res.status(200).json({
      durum: 'aktif',
      versiyon: '1.0.0',
      zaman: new Date().toISOString(),
    });
  }

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
    if (req.method === 'GET') {
      const sipData = await readSiparisler(musteriId);
      return res.status(200).json({
        musteriId,
        musteriAd,
        siparisler: sipData.siparisler || [],
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const islem = body.islem;

      if (!['ekle', 'sil', 'guncelle'].includes(islem)) {
        return res.status(400).json({ hata: 'Geçersiz işlem. Beklenen: ekle, sil, guncelle' });
      }

      const sipData = await readSiparisler(musteriId);
      sipData.musteriId = musteriId;
      sipData.musteriAd = musteriAd;

      let sonuc;
      if (islem === 'ekle')     sonuc = handleEkle(sipData, body);
      if (islem === 'sil')      sonuc = handleSil(sipData, body);
      if (islem === 'guncelle') sonuc = handleGuncelle(sipData, body);

      if (sonuc.hata) return res.status(sonuc.status || 400).json({ hata: sonuc.hata });

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
    if (err.message.includes('5')) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        if (req.method === 'GET') {
          const sipData = await readSiparisler(musteriId);
          return res.status(200).json({ musteriId, musteriAd, siparisler: sipData.siparisler || [] });
        }
      } catch { /* retry de başarısızsa aşağıya düş */ }
    }
    return res.status(502).json({ hata: 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.' });
  }
}
