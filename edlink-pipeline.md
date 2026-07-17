# Edlink Academic Pipeline — Project Brief

> **Untuk AI Agent:** Dokumen ini adalah sumber kebenaran tunggal (_Single Source of Truth_) proyek ini. Setiap kali kamu melanjutkan pekerjaan, baca seluruh dokumen ini terlebih dahulu sebelum menulis kode atau mengambil keputusan teknis apapun. Jangan asumsikan konteks dari sesi sebelumnya.

---

## 1. Tujuan & Prinsip

**Tujuan:** Mengotomatisasi tugas administratif perkuliahan di Edlink — mendeteksi materi baru, mengunduh file, menyiapkan bahan di Google Drive, dan memberi notifikasi — agar pengguna tinggal melakukan summarize manual via Chat AI.

**Apa yang diotomasi:**

- Mendeteksi postingan baru di Edlink (yang belum di-Like)
- Mengunduh file attachment (PDF/PPTX/DOCX) per sesi
- Mengambil URL video YouTube jika ada (bukan transcript-nya)
- Menekan Like sebagai flag "sudah diproses"
- Mengetik komentar "terima kasih" dan mengirimnya
- Membuat `header.txt` per sesi (mata kuliah, topik, daftar file, URL YouTube)
- Mengunggah semua file + `header.txt` ke Google Drive
- Mengklasifikasikan apakah sesi mengandung tindakan aktif (ACTION) atau tidak (STANDARD)
- Mengirim notifikasi Telegram dengan ringkasan sesi + status ACTION/STANDARD

**Apa yang TIDAK diotomasi (dilakukan manual oleh pengguna):**

- Mentranskrip video YouTube (dilakukan oleh Chat AI yang membaca `header.txt`)
- Membuat rangkuman materi (dilakukan via Chat AI dengan file dari Drive + URL dari header)
- Memasukkan rangkuman ke Notion atau dokumen apapun

**Prinsip utama yang tidak boleh dilanggar:**

- **Cukup, Stabil, Berjalan** — tidak ada fitur yang belum dibutuhkan.
- **No overengineering** — solusi paling sederhana yang bekerja adalah solusi yang benar.
- **Incremental** — setiap fase harus _fully working_ sebelum lanjut ke fase berikutnya.

---

## 2. Tech Stack

| Komponen   | Teknologi            | Peran                                           |
| ---------- | -------------------- | ----------------------------------------------- |
| Runtime    | Node.js + TypeScript | Bahasa utama semua skrip                        |
| Automation | Playwright           | Scraping & interaksi UI Edlink                  |
| AI         | Groq API (Qwen)      | Klasifikasi instruksi STANDARD/ACTION           |
| Storage    | Google Drive API     | Penyimpanan permanen file & header.txt per sesi |
| Notifikasi | Telegram Bot API     | Mengirim alert + status sesi ke pengguna        |
| Deployment | Google Cloud Run     | Menjalankan pipeline di cloud (serverless, job) |
| Scheduler  | Cloud Scheduler      | Trigger otomatis harian                         |

> **Catatan untuk AI Agent:** Jika kamu akan menambah dependency baru, selalu tanyakan ke pengguna terlebih dahulu. Jangan instal package yang belum ada di daftar ini tanpa konfirmasi eksplisit.

---

## 3. Arsitektur Sistem (Gambaran Besar)

```
[Edlink LMS — /panel/ Timeline]
     │
     │  Filter: hanya postingan yang BELUM di-Like
     ▼
[Fase 1: Extraction Engine] ✅ SELESAI
  - Login & navigasi ke /panel/
  - clearPopups(page)
  - Infinity scroll untuk memuat semua postingan
  - Filter Like: ambil postingan dengan mdi-heart-outline
  - 3-Layer extraction:
      Layer 1 → courseId, sectionId, topic, sourceUrl
      Layer 2 → courseName, learningObjective, learningMaterials[]
      Layer 3 → title, notes, attachments (file URL atau videoUrl)
     │
     ▼
[Fase 2: Processing Engine] 🔧 SEDANG DIKERJAKAN
  - Untuk setiap postingan yang belum di-Like:
      1. Download file attachment (PDF/PPTX/DOCX) ke lokal sementara
      2. Ambil URL YouTube jika ada (simpan di header.txt, TIDAK fetch transcript)
      3. Tekan Like (flag "sudah diproses")
      4. Ketik komentar "terima kasih" → kirim
  - Klasifikasi STANDARD/ACTION dari notes + title (Groq API)
  - Generate header.txt per sesi
     │
     ▼
[Fase 3: Storage & Notification] 📋 DIRENCANAKAN
  - Upload semua file + header.txt ke Google Drive (folder per MK/per sesi)
  - Kirim notifikasi Telegram:
      → Semua sesi: nama MK, topik, tipe instruksi, link Drive folder
      → Sesi ACTION: highlight khusus (emoji ⚠️) sebagai pengingat
     │
     ▼
[Fase 4: Deployment] 📋 DIRENCANAKAN
  - Dockerfile (base: mcr.microsoft.com/playwright)
  - Deploy ke Cloud Run sebagai Job
  - Cloud Scheduler: trigger harian otomatis
```

> **Mengapa Google Drive wajib (bukan opsional):**
> Cloud Run bersifat _stateless_ — setiap kali job selesai, container mati dan semua file lokal hilang.
> Google Drive adalah satu-satunya cara agar file hasil extraction dapat diakses oleh pengguna setelah deployment.

---

## 4. Status Proyek Saat Ini

**Status keseluruhan:** Fase 1 selesai. Fase 2 sedang dikerjakan (sebagian sudah dibuat, perlu disesuaikan). Fase 3 & 4 belum dimulai.

### ✅ Sudah Selesai (Fase 1 — Extraction Engine)

- Login ke Edlink dengan `clearPopups()` untuk menangani modal interupsi
- Navigasi ke `/panel/` + Infinity Scroll (3x scroll)
- Filter Like: hanya proses postingan `mdi-heart-outline`
- 3-Layer extraction: Timeline → Section → Detail Item
- Ekstrak dari Layer 2: `courseName`, `topic`, `learningObjective`
- Ekstrak dari Layer 3: `title`, `notes`, `attachments[]` (file atau video)
- Output: `output/raw-posts.json`

### 🔧 Perlu Disesuaikan (Fase 2 — Processing Engine)

- `src/intelligence/classifier.ts` — klasifikasi STANDARD/ACTION dari notes + title ✅ (sudah ada, perlu verifikasi)
- `src/intelligence/preparer.ts` — **DIUBAH:**
  - ✅ Download file attachment
  - ✅ Ambil URL YouTube (simpan ke header.txt) — BUKAN fetch transcript
  - ✅ Generate `header.txt` (format: mata kuliah, topik, daftar file, URL YouTube)
  - ❌ HAPUS: Fetch transcript YouTube (tidak lagi dilakukan oleh bot)
  - 🆕 BARU: Tekan Like via Playwright setelah extraction selesai
  - 🆕 BARU: Ketik & kirim komentar "terima kasih"
- `src/index.ts` — orkestrasi pipeline lengkap

### 📋 Direncanakan (Fase 3 — Storage & Notification)

- `src/storage/drive.ts` — upload file sesi + header.txt ke Google Drive (Service Account)
- `src/notifications/telegram.ts` — kirim notifikasi dengan status STANDARD/ACTION

### 📋 Direncanakan (Fase 4 — Deployment)

- `Dockerfile`
- Cloud Run Job configuration
- Cloud Scheduler setup

---

## 5. Detail Per Fase

### Fase 1: Extraction Engine ✅

**Arsitektur 3-Layer Edlink:**

```
Layer 1 — /panel/  (Timeline)
  Yang diambil: courseId, sectionId, topic, sourceUrl, sessionNumber
    sessionNumber: di-parse dari teks link ("Sesi ke 12" → "12")
  Mekanisme deduplikasi: Like button
    - mdi-heart (filled) → sudah diproses → SKIP
    - mdi-heart-outline → belum diproses → masukkan ke antrian (Like dilakukan di Fase 2)

       │
       ▼

Layer 2 — /panel/classes/:courseId/sections/:sectionId
  Yang diambil:
    - courseName: dari p.title.font-24.font-w-600
    - topic: dari kotak "Informasi" → field label "Topik"
    - learningObjective: dari kotak "Informasi" → field label "Tujuan Pembelajaran"
    - learningMaterials[]: dari semua link a[href*="/sections/"] yang merupakan anak section ini

       │
       ▼

Layer 3 — /panel/classes/:courseId/sections/:sectionId/:learningMaterialId
  Yang diambil per item:
    - title: dari h3.title.is-5
    - notes: dari .card.is-boxed dengan header "Catatan"
    - attachments[]:
        File  → { filename, url } dari .post-media-item__download (intercept download event)
        Video → { videoUrl } dari iframe#player src
        (bisa keduanya dalam 1 item — tidak dibatasi)
```

**Output:** `output/raw-posts.json`

---

### Fase 2: Processing Engine 🔧

**Tujuan:** Untuk setiap sesi yang belum diproses — download materi, tandai sudah dibaca (Like + komentar), dan siapkan `header.txt` sebagai panduan Chat AI.

**Urutan aksi per postingan:**

```
1. Buka postingan (Layer 2 & 3 extraction sudah selesai)
2. Download semua file attachment (PDF/PPTX/DOCX) ke lokal sementara
3. Ambil URL YouTube dari iframe#player src (jika ada) → simpan di variabel, TIDAK fetch transcript
4. Tekan tombol Like (mdi-heart-outline → klik → tunggu menjadi mdi-heart)
5. Temukan input komentar → ketik "terima kasih" → klik Send/Submit
6. Klasifikasi STANDARD/ACTION dari notes + title via Groq API
7. Generate header.txt
```

**Format `header.txt` per sesi:**

```
Mata Kuliah : [courseName]
Topik       : [topic]
Tujuan      : [learningObjective]
Tipe        : STANDARD | ACTION

--- Materi ---
File        : [filename1.pdf]
File        : [filename2.pptx]
Video       : https://youtube.com/watch?v=...

--- Catatan Dosen ---
[notes dari setiap learningMaterial, label per item jika lebih dari satu]

--- Petunjuk untuk Chat AI ---
Baca header ini. Jika ada File → cari di Google Drive folder sesi ini.
Jika ada Video → buka URL, transkripsi, lalu gunakan sebagai bahan rangkuman.
Jika Tipe = ACTION → cek bagian Catatan Dosen untuk detail instruksi yang perlu ditindaklanjuti.
```

**File yang dihasilkan per sesi** — sementara di `output/sessions/[sectionId]/`:

| File                         | Isi                                                                    |
| ---------------------------- | ---------------------------------------------------------------------- |
| `header.txt`                 | Mata kuliah, topik, daftar file, URL YouTube, catatan dosen, tipe sesi |
| `[filename].pdf/.pptx/.docx` | File attachment yang diunduh dari Edlink                               |

> **Tidak ada `transcript.txt`** — transkripsi video dilakukan manual oleh Chat AI saat pengguna memulai sesi rangkuman.

**Logika klasifikasi STANDARD/ACTION:**

- Input: `title` + `notes` semua learningMaterials dalam satu sesi
- Model: `qwen/qwen3.6-27b` via Groq (cepat dan efisien)
- STANDARD: hanya disuruh membaca/menonton/mengunduh
- ACTION: ada kata kunci aktif — kuis, tugas, diskusi, kumpulkan, jawab, submit, upload, deadline

---

### Fase 3: Storage & Notification 📋

**Google Drive — Struktur Folder:**

```
My Drive/
└── Classes/
    └── Semester [n]/              ← dikonfigurasi via env var SEMESTER
        └── [Nama Mata Kuliah]/
            ├── 12/                ← sessionNumber dari Layer 1 ("Sesi ke 12" → "12")
            │   ├── header.txt
            │   ├── [filename].pdf
            │   └── [filename2].pptx
            ├── 13/
            │   ├── header.txt
            │   └── [filename].pptx
            └── 14/
                └── header.txt
```

**Sumber nomor sesi:**
- `sessionNumber` sudah di-extract di Layer 1 dari teks link di timeline
- Contoh: teks `"Sesi ke 12"` → `sessionNumber = "12"` → folder Drive = `12/`
- Tidak perlu hitung atau increment — langsung pakai nilai dari Edlink

**Autentikasi Google Drive:** Service Account (tidak perlu login manual, cocok untuk bot otomatis).
Setup: buat Service Account di Google Cloud → share folder "Classes" di Drive ke email service account.

**Telegram Notification — Format pesan:**

```
📚 *[Nama Mata Kuliah]*
📌 [Topik Sesi]

🏷️ Tipe: STANDARD
  → Materi siap di Drive. Buka header.txt untuk mulai rangkuman.

— ATAU —

⚠️ *ACTION DIPERLUKAN* — [Nama Mata Kuliah]
📌 [Topik Sesi]

📋 Detail:
[ringkasan 1–2 kalimat dari notes/instruksi dosen]

📁 Materi:
- [nama file 1]
- [nama file 2]
- 🎥 Video: [URL YouTube jika ada]

🔗 [Buka Folder Drive]
```

- Semua sesi (STANDARD & ACTION) mendapat notifikasi
- Sesi ACTION menggunakan header ⚠️ dan menyertakan ringkasan instruksi dosen
- URL YouTube disertakan langsung di notifikasi Telegram jika ada

---

### Fase 4: Deployment 📋

**Tujuan:** Pipeline berjalan otomatis di cloud tanpa intervensi manual.

**Langkah:**

1. Buat `Dockerfile` — base image: `mcr.microsoft.com/playwright:v1.x.x-jammy`
2. Push image ke Google Artifact Registry
3. Deploy ke Cloud Run sebagai **Job** (bukan Service — tidak butuh HTTP endpoint)
4. Setup Cloud Scheduler: trigger harian (pukul 17.00 WIB)

---

## 6. Keputusan Desain (Tidak Boleh Diubah Tanpa Diskusi)

| Keputusan                                         | Alasan                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/panel/` timeline sebagai entry point            | Satu halaman mengagregasi semua postingan baru — efisien untuk bot harian                                                 |
| Like Edlink sebagai flag deduplikasi              | Lebih simpel dari database eksternal; bisa diset manual untuk materi lama; tidak butuh storage tambahan                   |
| Like dilakukan SETELAH extraction selesai         | Mencegah flag terset jika bot crash di tengah jalan — sesi yang gagal akan dicoba ulang di run berikutnya                 |
| Komentar "terima kasih" dikirim setiap sesi       | Interaksi minimal sebagai etika ke dosen; dilakukan otomatis setelah Like                                                 |
| Bot hanya ambil URL YouTube, TIDAK fetch transcript | Transcript dilakukan manual oleh Chat AI — lebih fleksibel, tidak perlu API eksternal, tidak ada risiko rate limit      |
| `header.txt` sebagai jembatan bot ↔ Chat AI      | Chat AI membaca header, cari file di Drive, transcript video dari URL — semua info ada di satu file                       |
| Google Drive sebagai storage permanen             | Cloud Run stateless — file lokal hilang saat container mati; Drive adalah satu-satunya cara akses file setelah deployment |
| Rangkuman dilakukan manual via Chat AI            | Bot tidak tahu konteks belajar pengguna; kualitas rangkuman lebih baik jika pengguna yang memilih fokusnya                |
| Klasifikasi STANDARD/ACTION dari notes+title saja | Tidak perlu baca isi file → lebih cepat, hemat API, lebih stabil                                                         |
| Tidak download video asli                         | Hemat storage Drive dan waktu transfer; URL sudah cukup untuk Chat AI                                                     |
| Notifikasi via Telegram, bukan email              | Lebih cepat dan actionable di mobile                                                                                      |
| Cloud Run Job (bukan Service)                     | Tidak perlu bayar saat idle; cocok untuk workload periodik                                                                |
| Groq API (Qwen) untuk klasifikasi                 | Cepat, efisien, dan cocok untuk instruksi teks sederhana                                                  |

---

## 7. Struktur Direktori Proyek (Target Akhir)

```
edlink-pipeline/
├── src/
│   ├── extraction/
│   │   ├── login.ts          # ✅ Login + browser context
│   │   ├── navigate.ts       # ✅ Timeline scan + Like filter
│   │   ├── extract.ts        # ✅ Layer 2 & 3 extraction
│   │   └── utils.ts          # ✅ clearPopups helper
│   ├── intelligence/
│   │   ├── classifier.ts     # ✅ STANDARD/ACTION dari notes+title
│   │   └── preparer.ts       # 🔧 Download file, ambil URL YouTube, generate header.txt
│   ├── interaction/
│   │   └── engage.ts         # 🆕 Fase 2 — Like + komentar "terima kasih"
│   ├── storage/
│   │   └── drive.ts          # 📋 Fase 3 — Upload ke Google Drive
│   ├── notifications/
│   │   └── telegram.ts       # 📋 Fase 3 — Kirim notifikasi Telegram
│   └── index.ts              # ✅ Orkestrasi pipeline
├── output/
│   ├── raw-posts.json        # Output JSON pipeline
│   └── sessions/             # Folder sementara per sesi (sebelum upload Drive)
│       └── [sectionId]/
│           ├── header.txt
│           └── [filename].pdf
├── .env                      # Kredensial (tidak di-commit)
├── .env.example              # Template environment variables
├── Dockerfile                # 📋 Fase 4
├── summarizer-prompt.md      # Prompt untuk Chat AI manual — dilampirkan user saat sesi rangkuman
├── edlink-pipeline.md        # SSOT proyek ini
├── package.json
└── tsconfig.json
```

---

## 8. Environment Variables yang Dibutuhkan

```env
# Edlink
EDLINK_EMAIL=
EDLINK_PASSWORD=
EDLINK_BASE_URL=https://kuliah.edlink.ac.id

# Groq
GROQ_API_KEY=

# Google Drive (Service Account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=   # ID folder "Classes" di Drive yang sudah di-share ke service account
SEMESTER=1                     # Nomor semester aktif — ganti ke 2, 3, dst. setiap awal semester baru

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

> **Catatan untuk AI Agent:** Jangan pernah hardcode credential apapun di dalam kode. Selalu gunakan `process.env.VARIABLE_NAME`. Jika `.env` belum ada, minta pengguna untuk membuatnya dari `.env.example`.

---

## 9. Panduan untuk AI Agent

**Sebelum memulai setiap sesi:**

1. Baca seluruh dokumen ini.
2. Identifikasi task pertama yang belum selesai di bagian "Status Proyek".
3. Konfirmasi task yang akan dikerjakan kepada pengguna sebelum menulis kode.

**Saat menulis kode:**

- Selalu gunakan TypeScript, bukan JavaScript.
- Gunakan `async/await`, bukan callback atau `.then()` chain.
- Setiap fungsi harus memiliki JSDoc minimal satu baris.
- Tambahkan `try/catch` di semua operasi I/O.
- Gunakan `console.log` dengan prefix `[INFO]`, `[WARN]`, `[ERROR]`.

**Saat menggunakan Playwright:**

- Jalankan `clearPopups(page)` setelah tiba di halaman baru.
- Simpan screenshot saat error: `await page.screenshot({ path: 'debug/error-layerN-id.png' })`.
- Untuk Like: klik tombol Like, tunggu class berubah dari `mdi-heart-outline` ke `mdi-heart` sebelum lanjut.
- Untuk komentar: cari textarea komentar, fill "terima kasih", klik Submit, tunggu konfirmasi terkirim.

**Yang tidak boleh dilakukan tanpa konfirmasi:**

- Menambah dependency baru ke `package.json`.
- Mengubah skema output JSON.
- Mengubah keputusan desain di bagian 6.
- Melompat ke fase berikutnya sebelum fase saat ini selesai dan diverifikasi.
- Fetch/download transcript YouTube — ini adalah tugas Chat AI, bukan bot.
