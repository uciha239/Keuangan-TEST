// API untuk dashboard: POST /api/login, GET /api/data?bulan=YYYY-MM, POST /api/hapus
import { cekPassword, dataBulan, deleteTx, signToken, verifyToken } from "../lib/core.mjs";

export const config = { path: ["/api/login", "/api/data", "/api/hapus"] };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) return json({ error: "Server belum dikonfigurasi" }, 500);

  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/api/login") {
    if (req.method !== "POST") return json({ error: "Method tidak diizinkan" }, 405);
    let body = {};
    try { body = await req.json(); } catch { /* kosong */ }
    await tunggu(400); // memperlambat tebak-tebakan password
    if (!cekPassword(body.password ?? "", password)) return json({ error: "Password salah" }, 401);
    return json({ token: signToken(secret) });
  }

  const auth = req.headers.get("authorization") || "";
  if (!verifyToken(secret, auth.replace(/^Bearer\s+/i, ""))) return json({ error: "Belum login" }, 401);

  if (pathname === "/api/data" && req.method === "GET") {
    return json(await dataBulan(searchParams.get("bulan")));
  }

  if (pathname === "/api/hapus" && req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch { /* kosong */ }
    const tx = body.id ? await deleteTx(String(body.id)) : null;
    return tx ? json({ ok: true }) : json({ error: "Transaksi tidak ditemukan" }, 404);
  }

  return json({ error: "Tidak ditemukan" }, 404);
};
