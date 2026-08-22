// Weekly digest entry point (TASK.md section 4-5) — manual trigger, every
// Monday morning:
//   node src/digest.js            — generate, save, and email the digest
//   node src/digest.js --dry-run  — generate and save to disk only, skip
//                                   the email send (no SMTP creds needed)
//
// On a successful send, src/data/articles.json is cleared (per TASK.md
// section 7 "clear articles.json for next week") so the next weekly run
// only picks up articles gathered since. A --dry-run never clears it.
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadArticles, saveArticles } from './services/storage.js';
import { generateDigest, renderDigestHtml, getMondayOfWeek, formatMondayLabel, formatMondayISO } from './services/digest-generator.js';
import { sendDigestEmail } from './services/mailer.js';
import { loadSentArticles, saveSentArticles, filterUnsent, recordSentArticles } from './services/sent-articles-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIGESTS_DIR = path.join(__dirname, 'data', 'digests');

async function saveDigestToDisk(digestText, monday) {
  await fs.mkdir(DIGESTS_DIR, { recursive: true });
  const filePath = path.join(DIGESTS_DIR, `digest_${formatMondayISO(monday)}.txt`);
  await fs.writeFile(filePath, digestText, 'utf-8');
  return filePath;
}

export async function runDigestCycle({ dryRun = false } = {}) {
  const startedAt = Date.now();
  const monday = getMondayOfWeek();

  const allArticles = await loadArticles();
  console.log(`[digest] ${allArticles.length} article(s) in src/data/articles.json`);

  const sentEntries = await loadSentArticles();
  const articles = filterUnsent(allArticles, sentEntries);
  console.log(`[digest] ${articles.length}/${allArticles.length} not already sent in a previous digest`);

  if (!articles.length) {
    console.log('[digest] nothing to digest — exiting');
    return null;
  }

  console.log(`[digest] generating digest for week of ${formatMondayLabel(monday)}...`);
  const { text: digestText, entries } = await generateDigest(articles, new Date());
  const digestHtml = renderDigestHtml(entries, monday);

  const savedPath = await saveDigestToDisk(digestText, monday);
  console.log(`[digest] saved to ${savedPath}`);

  if (dryRun) {
    console.log('[digest] --dry-run: skipping email send');
    return { digestText, digestHtml, savedPath, sent: false };
  }

  const subject = `Railway News Digest — Week of ${formatMondayLabel(monday)}`;
  const { to } = await sendDigestEmail(subject, { text: digestText, html: digestHtml });
  console.log(`[digest] email sent to: ${to.join(', ')}`);

  const updatedSentEntries = recordSentArticles(articles.map((a) => a.url), sentEntries);
  await saveSentArticles(updatedSentEntries);
  console.log(`[digest] recorded ${articles.length} sent url(s) in src/data/sent_articles.json`);

  await saveArticles([]);
  console.log('[digest] cleared src/data/articles.json for next week');

  console.log(`[digest] cycle done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  return { digestText, digestHtml, savedPath, sent: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const dryRun = process.argv.includes('--dry-run');

  runDigestCycle({ dryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[digest] run failed:', err.message);
      process.exit(1);
    });
}
