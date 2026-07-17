import "dotenv/config";
import { loginToEdlink } from "./extraction/login.js";
import { getRecentPosts } from "./extraction/navigate.js";
import { extractPostDetails } from "./extraction/extract.js";
import { engagePost, watchVideos } from "./interaction/engage.js";
import { classifySession } from "./intelligence/classifier.js";
import { prepareSession } from "./intelligence/preparer.js";
import { uploadSessionToDrive } from "./storage/drive.js";
import { sendTelegramNotification } from "./notifications/telegram.js";
import fs from "fs";
import path from "path";

async function main() {
  console.log("====================================");
  console.log("🤖 EDLINK PIPELINE - MULAI");
  console.log("====================================");

  const baseUrl = process.env.EDLINK_BASE_URL || "https://edlink.id";

  try {
    const { context, page } = await loginToEdlink();

    // ── Fase 1: Extraction ────────────────────────────────────────────────
    console.log("\n[INFO] ── FASE 1: EXTRACTION ──");
    const recentPosts = await getRecentPosts(page);

    if (recentPosts.length === 0) {
      console.log("[INFO] ✅ Tidak ada materi baru. Selesai.");
      await context.close();
      process.exit(0);
    }

    // MAX_POSTS: batasi jumlah postingan yang diproses (untuk testing)
    // Set MAX_POSTS=1 di .env untuk tes 1 postingan saja
    const maxPosts = parseInt(process.env.MAX_POSTS || "0", 10);
    const postsToProcess = maxPosts > 0 ? recentPosts.slice(0, maxPosts) : recentPosts;

    if (maxPosts > 0) {
      console.log(`[INFO] ⚙️  MAX_POSTS=${maxPosts} — hanya memproses ${postsToProcess.length} dari ${recentPosts.length} postingan.`);
    }

    const finalData = [];

    for (let i = 0; i < postsToProcess.length; i++) {
      const post = postsToProcess[i]!;
      console.log(
        `\n${"=".repeat(50)}\n[PROSES ${i + 1}/${postsToProcess.length}] Sesi: ${post.sectionId}\n${"=".repeat(50)}`
      );

      const sessionDir = path.join(process.cwd(), "output", "sessions", post.sectionId);
      const isAlreadyProcessed = fs.existsSync(path.join(sessionDir, "header.txt"));

      if (isAlreadyProcessed) {
        console.log(`[INFO] ⏩ Sesi ${post.sectionId} sudah pernah diproses sebelumnya (terdeteksi folder lokal).`);
        console.log(`[INFO] ── FASE 2b: ENGAGEMENT (Like Saja) ──`);
        // Passing "ACTION" agar bot skip komentar (hanya melakukan Like)
        await engagePost(page, post.containerHandle, post.sectionId, "ACTION");
        continue;
      }

      let currentPhase = "EXTRACTION (Layer 2 & 3)";
      let extractPage = null;
      try {
        // ── Buka tab baru untuk ekstraksi agar ElementHandle timeline tidak rusak ──
        extractPage = await context.newPage();

        // ── Layer 2 & 3: Ekstrak semua materi ──────────────────────────
        const sectionDetails = await extractPostDetails(extractPage, post.sourceUrl);

        const sessionTopic =
          sectionDetails.topic && sectionDetails.topic !== "-"
            ? sectionDetails.topic
            : post.topic;

        const courseName = sectionDetails.courseName || sessionTopic;

        // ── Fase 2a: Tonton video (tab baru, natural play) ────────────────
        currentPhase = "WATCH VIDEOS (YouTube Progress Tracking)";
        console.log(`\n[INFO] ── FASE 2a: WATCH VIDEOS ──`);
        await watchVideos(context, sectionDetails.learningMaterials);

        // ── Tutup tab ekstraksi karena sudah tidak dibutuhkan ────────────
        await extractPage.close();
        extractPage = null;

        // ── Fase 2b: Klasifikasi (Groq AI) ───────────────────────
        currentPhase = "KLASIFIKASI (Groq AI)";
        console.log(`\n[INFO] ── FASE 2b: KLASIFIKASI ──`);
        const classification = await classifySession(
          sessionTopic,
          sectionDetails.learningMaterials
        );

        // Gunakan topik hasil rapihan AI
        const finalTopic = classification.proper_topic;

        // ── Fase 2c: Engagement (Like + komentar) — SETELAH extraction ──
        // Kita berikan handle langsung dari timeline (page awal) yang masih valid!
        currentPhase = "ENGAGEMENT (Like + Komentar)";
        console.log(`\n[INFO] ── FASE 2c: ENGAGEMENT ──`);
        await engagePost(page, post.containerHandle, post.sectionId, classification.instruction_type);

        // ── Fase 2d: Prepare bahan (download file, ambil URL YouTube) ──
        currentPhase = "PREPARE BAHAN (Download File + Generate header.txt)";
        console.log(`\n[INFO] ── FASE 2d: PREPARE BAHAN ──`);
        const prepared = await prepareSession(
          post.sectionId,
          courseName,
          finalTopic, // <-- Menggunakan proper_topic dari AI
          post.sessionNumber,
          classification.instruction_type,
          sectionDetails.learningMaterials
        );

        // ── Fase 3: Storage & Notifikasi ───────────────────────────────
        currentPhase = "STORAGE & NOTIFIKASI (Google Drive / Telegram)";
        console.log(`\n[INFO] ── FASE 3: STORAGE & NOTIFIKASI ──`);

        const driveFolderUrl = await uploadSessionToDrive(
          courseName,
          post.sessionNumber,
          prepared.sessionDir
        );
        console.log(`[SUCCESS] File sesi berhasil diunggah ke Drive: ${driveFolderUrl}`);

        // Gabungkan semua notes untuk ringkasan ACTION di Telegram
        const allNotes = sectionDetails.learningMaterials
          .filter((m) => m.notes?.trim())
          .map((m) => m.notes.trim())
          .join(" | ");

        await sendTelegramNotification(
          courseName,
          post.sessionNumber,
          finalTopic, // <-- Menggunakan proper_topic dari AI
          classification.instruction_type,
          driveFolderUrl,
          prepared.downloadedFiles,
          prepared.youtubeUrls,
          allNotes,
          prepared.contentItems
        );

        finalData.push({
          courseId: post.courseId,
          sectionId: post.sectionId,
          sessionNumber: post.sessionNumber,
          courseName,
          topic: finalTopic,
          originalTopic: sessionTopic,
          sourceUrl: post.sourceUrl,
          learningObjective: sectionDetails.learningObjective,
          learningMaterials: sectionDetails.learningMaterials,
          instruction_type: classification.instruction_type,
          downloadedFiles: prepared.downloadedFiles,
          youtubeUrls: prepared.youtubeUrls,
          contentItems: prepared.contentItems,
          sessionDir: prepared.sessionDir,
          processed_at: new Date().toISOString(),
        });

        console.log(
          `\n[INFO] ✅ Sesi ${post.sectionId} selesai.\n` +
          `       Mata Kuliah  : ${courseName}\n` +
          `       Topik        : ${finalTopic}\n` +
          `       Tipe         : ${classification.instruction_type}\n` +
          `       Files        : ${prepared.downloadedFiles.join(", ") || "(tidak ada)"}\n` +
          `       Konten       : ${prepared.contentItems.join(", ") || "(tidak ada)"}\n` +
          `       Drive        : ${driveFolderUrl}`
        );
      } catch (err: any) {
        console.log(`\n[ERROR KRITIS] Gagal pada fase: ${currentPhase}`);
        console.log(`[URL SESI] ${post.sourceUrl}`);
        console.log(`[DETAIL PESAN] ${err.message || err}`);
        console.log(`[STACK TRACE]`, err.stack || "");
      } finally {
        if (extractPage && !extractPage.isClosed()) {
          await extractPage.close();
        }
      }
    }

    // ── Simpan ringkasan ke raw-posts.json ─────────────────────────────
    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, "raw-posts.json");
    fs.writeFileSync(
      outputFile,
      JSON.stringify({ extractedAt: new Date().toISOString(), posts: finalData }, null, 2)
    );

    console.log(
      `\n${"=".repeat(50)}\n` +
      `✅ PIPELINE SELESAI\n` +
      `   ${finalData.length} sesi diproses\n` +
      `   Output JSON : ${outputFile}\n` +
      `   Bahan sesi  : output/sessions/\n` +
      `${"=".repeat(50)}`
    );

    await context.close();
    console.log("[INFO] Bot dihentikan.");
    process.exit(0);
  } catch (error) {
    console.error("\n[FATAL ERROR] Pipeline terhenti:", error);
    process.exit(1);
  }
}

main();
