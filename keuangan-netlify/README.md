# Keuangan Pribadi — Telegram + Dashboard di Netlify

Kirim pengeluaran lewat Telegram, lihat dashboard dari HP. Data disimpan di Netlify Blobs (tanpa database luar).

## 1. Deploy ke Netlify
Pilih salah satu:
- **GitHub:** upload folder ini ke repo (private), lalu di Netlify pilih *Add new site → Import from Git*.
- **CLI:** `npm i -g netlify-cli`, lalu di folder ini jalankan `netlify login`, `netlify init`, `netlify deploy --prod`.

Jangan pakai drag-and-drop folder, karena Functions butuh proses build.

## 2. Isi Environment Variables
Netlify → Site configuration → Environment variables:

| Nama | Isi |
|---|---|
| `BOT_TOKEN` | token dari @BotFather |
| `TELEGRAM_SECRET` | kode acak sendiri, huruf/angka/`_`/`-` saja (contoh: `k3uangan_Xy92Qp7a`) |
| `DASHBOARD_PASSWORD` | password untuk login dashboard |
| `SESSION_SECRET` | teks acak panjang, mis. hasil `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OWNER_ID` | isi nanti di langkah 4 |

Setelah mengisi/mengubah variabel, **deploy ulang** supaya terbaca.

## 3. Pasang webhook Telegram
Hentikan dulu `bot.py` versi PC kalau masih jalan (webhook dan polling tidak bisa bersamaan).
Buka URL ini di browser (ganti 3 bagian huruf besar):

```
https://api.telegram.org/botTOKEN_BOT/setWebhook?url=https://NAMA-SITUS.netlify.app/api/telegram&secret_token=ISI_TELEGRAM_SECRET
```
Hasil yang benar: `{"ok":true,"result":true,...}`

## 4. Kunci ke akun kamu
Kirim `/id` ke bot → salin angkanya → isi `OWNER_ID` → deploy ulang.
Sebelum `OWNER_ID` diisi, bot hanya menjawab `/id`.

## 5. Pakai
- `makan siang 25rb` · `bensin 50000 #transport` · `+gaji 5jt`
- `/rekap hari|minggu|bulan` · `/list` · `/hapus` · `/export` (CSV)
- Dashboard: buka `https://NAMA-SITUS.netlify.app`, login dengan `DASHBOARD_PASSWORD`.

## Catatan
- Data versi lama (`keuangan.db`) tidak otomatis pindah ke sini.
- Batas gratis Netlify berbasis credit bulanan; cek di halaman Usage kalau pemakaian membesar.
