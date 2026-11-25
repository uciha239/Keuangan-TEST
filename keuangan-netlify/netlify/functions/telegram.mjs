// Webhook Telegram -> POST /api/telegram
import {
  addTx, allTx, deleteLast, jakartaNow, lastN, parsePesan, rekap, rp, toCsv,
} from "../lib/core.mjs";

export const config = { path: "/api/telegram" };

const HELP = [
  "Cara pakai:",
  "• makan siang 25rb → pengeluaran",
  "• bensin 50000 #transport → pakai kategori sendiri",
  "• +gaji 5jt → pemasukan",
  "",
  "Perintah:",
  "/rekap [hari|minggu|bulan] – ringkasan",
  "/list – 10 transaksi terakhir",
  "/hapus – hapus transaksi terakhir",
  "/export – unduh CSV (bisa dibuka di Excel)",
  "/id – lihat Telegram ID kamu",
].join("\n");

const api = (method) => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;

async function kirim(chatId, text) {
  const r = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!r.ok) console.error("sendMessage gagal:", await r.text());
}

async function kirimFile(chatId, nama, isi) {
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("document", new Blob([isi], { type: "text/csv" }), nama);
  const r = await fetch(api("sendDocument"), { method: "POST", body: fd });
  if (!r.ok) console.error("sendDocument gagal:", await r.text());
}

async function tangani(msg) {
  const chatId = msg.chat.id;
  const teks = msg.text.trim();

  let cmd = null, args = [];
  if (teks.startsWith("/")) {
    const [first, ...rest] = teks.split(/\s+/);
    cmd = first.slice(1).split("@")[0].toLowerCase();
    args = rest;
  }

  if (cmd === "id") return kirim(chatId, `Telegram ID kamu: ${msg.from.id}`);

  // selain /id, hanya pemilik yang dilayani
  const owner = process.env.OWNER_ID;
  if (!owner || String(msg.from.id) !== String(owner)) return;

  switch (cmd) {
    case "start":
    case "help":
      return kirim(chatId, HELP);

    case "rekap": {
      const { label, rows } = await rekap((args[0] || "hari").toLowerCase());
      if (!rows.length) return kirim(chatId, `Belum ada transaksi ${label}.`);
      const perKat = {};
      let masuk = 0, keluar = 0;
      for (const r of rows) {
        if (r.tipe === "masuk") masuk += r.nominal;
        else { keluar += r.nominal; perKat[r.kategori] = (perKat[r.kategori] || 0) + r.nominal; }
      }
      const baris = [`📊 Rekap ${label}`, ""];
      for (const [k, n] of Object.entries(perKat).sort((a, b) => b[1] - a[1])) baris.push(`• ${k}: ${rp(n)}`);
      baris.push("", `Pengeluaran: ${rp(keluar)}`, `Pemasukan: ${rp(masuk)}`, `Selisih: ${rp(masuk - keluar)}`);
      return kirim(chatId, baris.join("\n"));
    }

    case "list": {
      const rows = await lastN(10);
      if (!rows.length) return kirim(chatId, "Belum ada data.");
      return kirim(chatId, rows.map((r) =>
        `${r.waktu.slice(5, 16).replace("T", " ")} ${r.tipe === "masuk" ? "+" : "-"}${rp(r.nominal)} ${r.catatan} #${r.kategori}`
      ).join("\n"));
    }

    case "hapus": {
      const tx = await deleteLast();
      return kirim(chatId, tx ? `🗑️ Dihapus: ${tx.catatan} ${rp(tx.nominal)}` : "Tidak ada data untuk dihapus.");
    }

    case "export": {
      const rows = await allTx();
      return kirimFile(chatId, `keuangan_${jakartaNow().date.replaceAll("-", "")}.csv`, toCsv(rows));
    }

    case null: {
      const hasil = parsePesan(teks);
      if (!hasil) return kirim(chatId, "Nominal tidak ketemu. Contoh: makan siang 25rb");
      await addTx(hasil);
      const ikon = hasil.tipe === "masuk" ? "💰 Pemasukan" : "✅ Pengeluaran";
      return kirim(chatId, `${ikon} ${rp(hasil.nominal)}\n${hasil.catatan} · #${hasil.kategori}`);
    }

    default:
      return kirim(chatId, "Perintah tidak dikenal. Ketik /help");
  }
}

export default async (req) => {
  const secret = process.env.TELEGRAM_SECRET;
  if (req.method !== "POST") return new Response("ok");
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let update;
  try { update = await req.json(); } catch { return new Response("ok"); }
  const msg = update?.message;
  if (!msg?.text) return new Response("ok");

  try {
    await tangani(msg);
  } catch (e) {
    console.error("error:", e);
    try { await kirim(msg.chat.id, "⚠️ Terjadi error, coba kirim ulang."); } catch { /* abaikan */ }
  }
  return new Response("ok"); // selalu 200 supaya Telegram tidak mengirim ulang
};
