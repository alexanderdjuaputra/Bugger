# Panduan Deploy BugBuster Pro — Vercel + Firebase

Dokumen ini panduan lengkap, langkah demi langkah, buat hosting BugBuster Pro
pakai **Vercel** (hosting website + server) dan **Firebase Firestore**
(database). Ikuti urutannya — jangan loncat, karena tiap langkah butuh hasil
dari langkah sebelumnya.

**Penting buat dipahami dulu:** ini SATU sistem terintegrasi yang nanti cuma
punya **satu URL** dari Vercel. Firebase di sini bukan "website kedua" — dia
cuma tempat nyimpen data di belakang layar. Customer site dan management site
sama-sama jalan di domain Vercel yang sama (`namadomain.vercel.app/` untuk
customer, `namadomain.vercel.app/management/` untuk operasional).

---

## Langkah 1 — Bikin project Firebase

1. Buka https://console.firebase.google.com
2. Klik **Add project** → kasih nama (misal `bugbuster-pro`) → lanjut sampai
   selesai (Google Analytics boleh di-skip, tidak perlu untuk ini).
3. Di sidebar kiri, klik **Build → Firestore Database** → **Create database**.
4. Pilih lokasi server (pilih yang terdekat, misal `asia-southeast1`
   kalau di Indonesia/Singapura) → pilih **Start in production mode** →
   **Enable**.

## Langkah 2 — Pasang security rules

Firestore production mode defaultnya nge-block semua akses. Itu sebenarnya
oke karena aplikasi ini cuma diakses lewat server (pakai Admin SDK yang
otomatis bypass rules), tapi biar eksplisit dan aman:

1. Di Firestore Database, klik tab **Rules**.
2. Hapus isinya, ganti dengan isi file `firestore.rules` yang ada di folder
   project ini (isinya nge-deny semua akses langsung dari browser/client,
   karena semua akses data HARUS lewat server Vercel kamu).
3. Klik **Publish**.

## Langkah 3 — Generate Service Account Key (kunci rahasia buat server)

Ini kunci yang dipakai server Vercel kamu buat "login" ke Firestore.

1. Di Firebase Console, klik ikon ⚙️ (Project Settings) di sebelah **Project
   Overview** → **Project settings**.
2. Klik tab **Service accounts**.
3. Klik **Generate new private key** → konfirmasi → sebuah file `.json`
   otomatis ke-download ke komputer kamu.
4. **JANGAN PERNAH upload file ini ke GitHub.** File ini kasih akses penuh ke
   project Firebase kamu. Simpan baik-baik, jangan di-share, jangan di-commit.

Buka file `.json` itu pakai text editor. Isinya kira-kira begini:

```json
{
  "type": "service_account",
  "project_id": "bugbuster-pro-xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@bugbuster-pro-xxxxx.iam.gserviceaccount.com",
  ...
}
```

Kamu butuh **3 nilai** dari file ini buat langkah selanjutnya:
`project_id`, `private_key`, dan `client_email`.

## Langkah 4 — Push project ke GitHub

1. Extract zip ini ke folder lokal.
2. Buka terminal di folder itu, jalankan:
   ```bash
   git init
   git add .
   git commit -m "BugBuster Pro - initial commit"
   ```
3. Buat repository baru di https://github.com/new (boleh private atau public
   — tapi karena `.gitignore` sudah benar, file kunci rahasia tidak akan
   ikut ter-commit walau repo-nya public).
4. Hubungkan dan push:
   ```bash
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git branch -M main
   git push -u origin main
   ```

**Cek dulu sebelum push:** jalankan `git status` — pastikan tidak ada file
bernama `serviceAccountKey.json` atau `.env` yang mau ter-commit. Kalau ada,
itu artinya `.gitignore` tidak terbaca dengan benar — STOP, jangan push, dan
periksa ulang.

## Langkah 5 — Import ke Vercel

1. Buka https://vercel.com → login (boleh pakai akun GitHub kamu langsung).
2. Klik **Add New → Project**.
3. Pilih repository GitHub yang baru kamu push.
4. Di halaman konfigurasi:
   - **Framework Preset**: pilih **Other**.
   - **Root Directory**: biarkan default (`.`).
   - Jangan klik Deploy dulu — lanjut ke Langkah 6 dulu buat isi environment
     variables, supaya deploy pertama langsung berhasil.

## Langkah 6 — Isi Environment Variables di Vercel

Masih di halaman konfigurasi yang sama (sebelum klik Deploy), buka bagian
**Environment Variables**, lalu tambahkan 3 baris ini satu-satu (nilainya
dari file `.json` di Langkah 3):

| Name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | nilai `project_id` dari file json |
| `FIREBASE_CLIENT_EMAIL` | nilai `client_email` dari file json |
| `FIREBASE_PRIVATE_KEY` | nilai `private_key` dari file json (**copy lengkap**, termasuk `-----BEGIN PRIVATE KEY-----` dan `-----END PRIVATE KEY-----`, termasuk semua `\n` di dalamnya — jangan diedit/dipotong) |

Setelah ketiganya terisi, klik **Deploy**.

## Langkah 7 — Tunggu deploy selesai

Proses build biasanya 30-60 detik. Kalau berhasil, Vercel kasih URL seperti
`https://nama-repo-xxxx.vercel.app`.

## Langkah 8 — Uji coba sebelum go-live

Ini langkah yang **tidak bisa saya lakukan untuk kamu** — kamu harus klik
sendiri karena ini akun Firebase/Vercel kamu. Lakukan urutan ini:

1. Buka `https://nama-kamu.vercel.app/` (customer site) — harus muncul
   halaman login/register, bukan error.
2. Coba login pakai akun demo: email `demo@bugbuster.test`, password
   `demo123`. Kalau berhasil masuk, artinya koneksi ke Firestore sudah benar.
3. Coba bikin booking baru lewat customer site.
4. Buka `https://nama-kamu.vercel.app/management/` (management site) —
   login pakai `admin` / `test`.
5. Cek apakah booking yang baru kamu buat di langkah 3 **muncul** di sini.
   Kalau muncul, berarti integrasi dua sisi sudah jalan dengan benar di
   environment production yang sesungguhnya.
6. Coba alur penuh: assign technician → submit report → approve report →
   mark completed → bayar invoice di customer site → kasih review bintang.
7. Coba refund dengan key yang salah (harus ditolak), lalu dengan key yang
   benar (`refund`) (harus berhasil, hanya setelah status `paid`).

Kalau langkah 2 gagal (tidak bisa konek), kemungkinan besar salah satu dari
3 environment variable di Langkah 6 salah ketik — terutama `FIREBASE_PRIVATE_KEY`
yang paling sering kepotong saat di-copy-paste. Buka Vercel project →
**Settings → Environment Variables**, cek lagi nilainya, lalu **Redeploy**
dari tab Deployments.

---

## Kenapa harus saya yang jalankan langkah-langkah ini sendiri?

Saya (Claude) tidak punya akses untuk:
- Bikin project Firebase asli atas nama kamu
- Generate service account key yang valid dan terdaftar di Google
- Login ke akun Vercel/GitHub kamu dan klik Deploy

Itu semua butuh akun pribadi kamu. Yang sudah saya kerjakan: nulis semua
kode backend (Firestore) dan frontend, lalu **menjalankan automated test
sebanyak 28 pengecekan** untuk memverifikasi logic-nya benar — termasuk
skenario khusus yang mensimulasikan dua "cold start" Vercel yang berbeda
mengakses data yang sama, untuk membuktikan sesi login admin tidak akan
hilang secara acak di production (ini bug yang umum terjadi kalau session
disimpan di memory biasa, bukan di database).

**Yang belum dan tidak bisa saya verifikasi:** koneksi nyata ke project
Firebase kamu, dan deploy nyata ke Vercel — karena sandbox saya tidak punya
akses internet ke server Google/Vercel. Test otomatis di atas dijalankan
memakai pengganti Firestore versi memory (lihat
`tests/firestoreMemoryShim.js`) yang meniru perilaku Firestore asli secara
akurat untuk operasi-operasi yang dipakai aplikasi ini — tapi itu tetap
bukan pengganti uji coba nyata di Langkah 8 di atas. Tolong jangan skip
Langkah 8.

---

## Testing lokal (opsional, sebelum deploy)

Kalau mau coba dulu di laptop sebelum deploy:

```bash
npm install
npm run seed     # cek koneksi ke Firestore + isi data awal (3 jenis layanan, 3 teknisi)
npm start        # buka http://localhost:3000/ dan http://localhost:3000/management/
```

`npm run seed` butuh kredensial Firebase yang sama seperti di atas — taruh
file `serviceAccountKey.json` (dari Langkah 3) di folder root project ini
untuk testing lokal (file ini sudah otomatis di-ignore oleh git, aman).

Untuk jalankan automated test suite (yang tadi saya jalankan, 28 pengecekan,
tidak butuh kredensial Firebase asli karena pakai memory shim):

```bash
npm test
```
