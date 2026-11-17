// Хадгалах хугацааны цэвэрлэгээг гараар/cron-оор ажиллуулах (сервер өөрөө ч өдөр бүр ажиллуулдаг).
//   npm run maintenance:retention            — устгана
//   npm run maintenance:retention -- --dry-run — юу устахыг л тоолно
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { runRetention } from '../src/lib/retention.js';

const dryRun = process.argv.includes('--dry-run');
try {
  const out = await runRetention({ dryRun });
  console.log(`${dryRun ? '[dry-run] ' : ''}Хадгалах хугацаа (ноорог ${config.retention.draftDays} өдөр):`, out);
} catch (e) {
  console.error(`Цэвэрлэгээ амжилтгүй: ${e.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
