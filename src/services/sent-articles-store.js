// Tracks which article URLs have already gone out in a digest email, so the
// same story doesn't get sent twice across weekly runs. Stored alongside
// src/data/articles.json in src/data/sent_articles.json as a flat list of
// { url, sentDate } records.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'sent_articles.json');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function loadSentArticles() {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function saveSentArticles(entries) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

/** Drop articles whose url is already recorded as sent. */
export function filterUnsent(articles, sentEntries) {
  const sentUrls = new Set(sentEntries.map((e) => e.url));
  return articles.filter((a) => !sentUrls.has(a.url));
}

/** Remove records older than maxDays (by sentDate) so the file doesn't grow forever. */
export function pruneOldEntries(entries, { maxDays = 30, referenceDate = new Date() } = {}) {
  const cutoff = referenceDate.getTime() - maxDays * MS_PER_DAY;
  return entries.filter((e) => {
    const sentTime = new Date(e.sentDate).getTime();
    return isNaN(sentTime) || sentTime >= cutoff;
  });
}

/**
 * Append newly-sent article urls (deduped against what's already recorded)
 * and prune anything older than maxDays, in one step.
 * @param {string[]} urls - urls of the articles just sent in a digest
 * @param {Array} existingEntries
 * @param {{maxDays?: number, referenceDate?: Date}} [options]
 */
export function recordSentArticles(urls, existingEntries, { maxDays = 30, referenceDate = new Date() } = {}) {
  const sentDate = referenceDate.toISOString();
  const existingUrls = new Set(existingEntries.map((e) => e.url));

  const additions = urls
    .filter((url) => !existingUrls.has(url))
    .map((url) => ({ url, sentDate }));

  return pruneOldEntries([...existingEntries, ...additions], { maxDays, referenceDate });
}
