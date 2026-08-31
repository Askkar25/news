// Weekly digest entry point (TASK.md section 4-5) — manual trigger, every
// Monday morning:
//   node src/digest.js            — generate, save, and email the digest
//   node src/digest.js --dry-run  — generate and save to disk only, skip
//                                   the email send (no SMTP creds needed)
//
// On a successful send, src/data/articles.json is cleared of every article
// that actually made it into the digest (per TASK.md section 7 "clear
// articles.json for next week") so the next weekly run only picks up
// articles gathered since. Any article OpenAI silently omitted from its
// response is left in articles.json (and NOT recorded in sent_articles.json)
// so it's retried on the next run instead of being lost. A --dry-run never
// touches either file.
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
  const { text: digestText, entries, includedArticles, missingArticles } = await generateDigest(articles, new Date());
  const digestHtml = renderDigestHtml(entries, monday);

  if (missingArticles.length) {
    console.warn(
      `[digest] OpenAI omitted ${missingArticles.length}/${articles.length} article(s) from the generated digest — they will NOT be marked as sent and stay in src/data/articles.json for the next run`
    );
  }

  const savedPath = await saveDigestToDisk(digestText, monday);
  console.log(`[digest] saved to ${savedPath}`);

  if (dryRun) {
    console.log('[digest] --dry-run: skipping email send');
    return { digestText, digestHtml, savedPath, sent: false };
  }

  const subject = `Railway News Digest — Week of ${formatMondayLabel(monday)}`;
  const { to } = await sendDigestEmail(subject, { text: digestText, html: digestHtml });
  console.log(`[digest] email sent to: ${to.join(', ')}`);

  const updatedSentEntries = recordSentArticles(includedArticles.map((a) => a.url), sentEntries);
  await saveSentArticles(updatedSentEntries);
  console.log(`[digest] recorded ${includedArticles.length} sent url(s) in src/data/sent_articles.json`);

  // Only the articles OpenAI actually included get cleared — anything it
  // omitted stays in articles.json so it's retried next run instead of being
  // silently lost. Carried-over articles are exempt from the scraper's
  // recency filter (that only runs on freshly-scraped articles, not on
  // existing articles.json entries — see scraper.js), so they won't get
  // dropped for aging past the 10-day window while they wait.
  await saveArticles(missingArticles);
  console.log(
    missingArticles.length
      ? `[digest] cleared ${includedArticles.length} sent article(s) from src/data/articles.json — ${missingArticles.length} carried over for next run`
      : '[digest] cleared src/data/articles.json for next week'
  );

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
