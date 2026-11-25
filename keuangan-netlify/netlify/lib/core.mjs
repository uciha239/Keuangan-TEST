// Logika bersama: parser chat, penyimpanan (Netlify Blobs), rekap, dan auth dashboard.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const TZ = "Asia/Jakarta";

const KATEGORI_OTOMATIS = {
  makanan: ["makan", "sarapan", "kopi", "minum", "snack", "jajan", "bakso", "nasi", "gofood", "grabfood"],
  transport: ["bensin", "parkir", "tol", "ojek", "gojek", "grab", "bus", "krl", "mrt", "busway"],
  belanja: ["belanja", "indomaret", "alfamart", "shopee", "tokopedia", "baju"],
  tagihan: ["listrik", "pulsa", "internet", "wifi", "air", "pdam", "bpjs", "token"],
  kesehatan: ["obat", "dokter", "apotek", "klinik"],
  hiburan: ["nonton", "bioskop", "game", "netflix", "spotify"],
};
const MULT = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6 };

// ---------- util ----------
export const rp = (n) => "Rp" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function jakartaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}:${p.second}` };
}

export function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

// ---------- parser ----------
export function parseAmount(tok) {
  const m = /^(\d+(?:[.,]\d+)*)(rb|ribu|k|jt|juta)?$/i.exec(tok);
  if (!m) return null;
  const suffix = (m[2] || "").toLowerCase();
  if (suffix) return Math.round(parseFloat(m[1].replace(",", ".")) * MULT[suffix]);
  return parseInt(m[1].replace(/[.,]/g, ""), 10);
}

export function tebakKategori(catatan) {
  const kata = catatan.toLowerCase().split(/\s+/);
  for (const [kat, keys] of Object.entries(KATEGORI_OTOMATIS)) {
    if (keys.some((k) => kata.includes(k))) return kat;
  }
  return "lainnya";
}

// "makan siang 25rb" | "bensin 50000 #transport" | "+gaji 5jt"
export function parsePesan(teks) {
  teks = (teks || "").trim();
  let tipe = "keluar";
  if (teks.startsWith("+")) { tipe = "masuk"; teks = teks.slice(1).trim(); }

  let kategori = null;
  const tokens = [];
  for (const t of teks.split(/\s+/)) {
    if (t.startsWith("#") && t.length > 1) kategori = t.slice(1, 31).toLowerCase();
    else tokens.push(t);
  }
  // nominal = angka terbesar, jadi "makan 2 orang 50rb" tetap terbaca Rp50.000
  let best = -1, bestVal = 0;
  tokens.forEach((t, i) => {
    const v = parseAmount(t);
    if (v !== null && v > bestVal) { best = i; bestVal = v; }
  });
  if (best < 0 || !Number.isSafeInteger(bestVal) || bestVal <= 0) return null;

  const catatan = (tokens.filter((_, i) => i !== best).join(" ") || "-").slice(0, 200);
  if (!kategori) kategori = tipe === "masuk" ? "pemasukan" : tebakKategori(catatan);
  return { tipe, nominal: bestVal, kategori, catatan };
}

// ---------- penyimpanan: satu blob per bulan ----------
// (globalThis.__KV__ hanya dipakai untuk tes lokal)
const kv = () => globalThis.__KV__ ?? getStore("keuangan");

export const loadMonth = async (b) => (await kv().get(`bulan-${b}`, { type: "json" })) ?? [];
const saveMonth = (b, arr) => kv().setJSON(`bulan-${b}`, arr);

export async function listMonths() {
  const { blobs } = await kv().list({ prefix: "bulan-" });
  return blobs.map((x) => x.key.slice(6)).sort().reverse();
}

export async function addTx({ tipe, nominal, kategori, catatan }) {
  const { date, time } = jakartaNow();
  const bulan = date.slice(0, 7);
  const arr = await loadMonth(bulan);
  const tx = { id: crypto.randomUUID().slice(0, 8), waktu: `${date}T${time}+07:00`, tipe, nominal, kategori, catatan };
  arr.push(tx);
  await saveMonth(bulan, arr);
  return tx;
}

export async function deleteTx(id) {
  for (const b of await listMonths()) {
    const arr = await loadMonth(b);
    const i = arr.findIndex((t) => t.id === id);
    if (i >= 0) {
      const [tx] = arr.splice(i, 1);
      await saveMonth(b, arr);
      return tx;
    }
  }
  return null;
}

export async function deleteLast() {
  for (const b of await listMonths()) {
    const arr = await loadMonth(b);
    if (arr.length) {
      const tx = arr.pop();
      await saveMonth(b, arr);
      return tx;
    }
  }
  return null;
}

export async function lastN(n) {
  const out = [];
  for (const b of await listMonths()) {
    const arr = await loadMonth(b);
    for (let i = arr.length - 1; i >= 0 && out.length < n; i--) out.push(arr[i]);
    if (out.length >= n) break;
  }
  return out;
}

export async function allTx() {
  const out = [];
  for (const b of (await listMonths()).reverse()) out.push(...(await loadMonth(b)));
  return out;
}

export async function rekap(periode) {
  const { date } = jakartaNow();
  let start = date, label = "hari ini";
  if (periode === "minggu" || periode === "pekan") { start = mondayOf(date); label = "minggu ini"; }
  else if (periode === "bulan") { start = date.slice(0, 7) + "-01"; label = "bulan ini"; }
  const rows = [];
  for (const b of await listMonths()) {
    if (b < start.slice(0, 7)) continue;
    for (const t of await loadMonth(b)) if (t.waktu.slice(0, 10) >= start) rows.push(t);
  }
  return { label, rows };
}

// data untuk dashboard
export async function dataBulan(bulan) {
  const now = jakartaNow().date.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(bulan || "")) bulan = now;
  const tersedia = await listMonths();
  if (!tersedia.includes(now)) tersedia.unshift(now);

  const rows = (await loadMonth(bulan)).slice().sort((a, b) => b.waktu.localeCompare(a.waktu));
  const masuk = rows.filter((r) => r.tipe === "masuk");
  const keluar = rows.filter((r) => r.tipe === "keluar");
  const jumlah = (xs) => xs.reduce((s, x) => s + x.nominal, 0);

  const perKategori = {};
  for (const r of keluar) perKategori[r.kategori] = (perKategori[r.kategori] || 0) + r.nominal;

  const hari = {};
  for (const r of rows) {
    const d = r.waktu.slice(8, 10);
    hari[d] ??= { tgl: d, masuk: 0, keluar: 0 };
    hari[d][r.tipe] += r.nominal;
  }
  return {
    bulan,
    bulan_tersedia: tersedia,
    total_masuk: jumlah(masuk),
    total_keluar: jumlah(keluar),
    per_kategori: Object.fromEntries(Object.entries(perKategori).sort((a, b) => b[1] - a[1])),
    harian: Object.values(hari).sort((a, b) => a.tgl.localeCompare(b.tgl)),
    masuk,
    keluar,
  };
}

// ---------- auth dashboard (token HMAC bertanda waktu) ----------
const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
const safeEq = (a, b) => {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("base64url");

export const cekPassword = (input, benar) => safeEq(sha(input), sha(benar));

export function signToken(secret, hari = 30) {
  const exp = String(Math.floor(Date.now() / 1000) + hari * 86400);
  return `${exp}.${hmac(secret, exp)}`;
}

export function verifyToken(secret, token) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  return safeEq(sig, hmac(secret, exp)) && Number(exp) > Date.now() / 1000;
}

// ---------- CSV (pemisah ; supaya terbuka rapi di Excel Indonesia) ----------
export function toCsv(rows) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["Waktu", "Tipe", "Nominal", "Kategori", "Catatan"].join(";");
  const body = rows.map((r) => [r.waktu, r.tipe, r.nominal, r.kategori, r.catatan].map(esc).join(";"));
  return "\uFEFF" + [head, ...body].join("\r\n");
}
