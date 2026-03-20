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
const GIST_API = 'https://api.github.com/gists'
