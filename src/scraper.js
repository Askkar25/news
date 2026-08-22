// Daily orchestrator: runs every site scraper in src/services/scrapers/,
// dedupes the results, filters them through OpenAI for railway-industry
// relevance, and appends the survivors to src/data/articles.json.
//
// Usage:
//   node src/scraper.js          — run once immediately, then keep the
//                                   process alive and re-run on a daily
//                                   cron schedule (SCRAPE_CRON, default 09:00)
//   node src/scraper.js --once   — run a single cycle and exit (good for an
//                                   external scheduler / manual testing)
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import cron from 'node-cron';

import { loadArticles, saveArticles } from './services/storage.js';
import { dedupeArticles } from './services/dedupe.js';
import { filterRecent } from './services/recency-filter.js';
import { filterRelevant } from './services/filter.js';
import { loadSentArticles, filterUnsent } from './services/sent-articles-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPERS_DIR = path.join(__dirname, 'services', 'scrapers');

async function loadScrapers() {
  const files = (await fs.readdir(SCRAPERS_DIR))
    .filter((f) => f.endsWith('.js') && !f.startsWith('_'));

  const scrapers = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(SCRAPERS_DIR, file)).href);
    if (typeof mod.scrape === 'function') {
      scrapers.push({ name: file.replace(/\.js$/, ''), scrape: mod.scrape });
    }
  }
  return scrapers;
}

async function scrapeAll(scrapers) {
  const results = await Promise.allSettled(scrapers.map((s) => s.scrape()));

  const rawArticles = [];
  results.forEach((result, i) => {
    const { name } = scrapers[i];
    if (result.status === 'fulfilled') {
      console.log(`[scraper] ${name}: ${result.value.length} articles`);
      rawArticles.push(...result.value);
    } else {
      console.error(`[scraper] ${name} FAILED: ${result.reason?.message || result.reason}`);
    }
  });
  return rawArticles;
}

/**
 * One full daily cycle: scrape -> drop already-known -> dedupe -> AI filter -> save.
 * @returns {Promise<Array>} newly saved articles
 */
export async function runScrapeCycle() {
  const startedAt = Date.now();
  const scrapers = await loadScrapers();
  console.log(`[scraper] cycle start — ${scrapers.length} source scrapers`);

  const rawArticles = await scrapeAll(scrapers);

  const existing = await loadArticles();
  const existingIds = new Set(existing.map((a) => a.id));
  const existingUrls = new Set(existing.map((a) => a.url));
  const unseen = rawArticles.filter((a) => !existingIds.has(a.id) && !existingUrls.has(a.url));

  const deduped = dedupeArticles(unseen);
  console.log(`[scraper] ${rawArticles.length} raw -> ${unseen.length} unseen -> ${deduped.length} after dedup`);

  // Daily cron cadence: anything older than 4 days is either stale-listing
  // noise or a backlog entry, not worth an OpenAI relevance call.
  const recent = filterRecent(deduped, { maxDays: 4 });
  console.log(`[scraper] ${recent.length}/${deduped.length} within the last 4 days`);

  // articles.json is emptied after every successful digest send (see
  // digest.js), so "unseen" above has no memory of what already went out —
  // without this, an article stays inside the 4-day recency window for up
  // to 4 days after being sent, and gets silently re-scraped, re-run through
  // the (paid) AI relevance filter, and re-saved each day until it ages out.
  // digest.js's own filterUnsent() would still catch it before a second
  // send, but only after paying for the relevance call again — check
  // sent_articles.json here instead, before that call.
  const sentEntries = await loadSentArticles();
  const notSent = filterUnsent(recent, sentEntries);
  console.log(`[scraper] ${notSent.length}/${recent.length} not already sent in a previous digest`);

  const relevant = await filterRelevant(notSent);
  console.log(`[scraper] ${relevant.length}/${notSent.length} passed AI filter`);

  if (relevant.length) {
    await saveArticles([...existing, ...relevant]);
    console.log(`[scraper] saved ${relevant.length} new article(s) to src/data/articles.json`);
  } else {
    console.log('[scraper] no new relevant articles this run');
  }

  console.log(`[scraper] cycle done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  return relevant;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    runScrapeCycle()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[scraper] run failed:', err);
        process.exit(1);
      });
  } else {
    const schedule = process.env.SCRAPE_CRON || '0 9 * * *';

    runScrapeCycle().catch((err) => console.error('[scraper] initial run failed:', err));

    cron.schedule(schedule, () => {
      runScrapeCycle().catch((err) => console.error('[scraper] scheduled run failed:', err));
    });

    console.log(`[scraper] cron scheduler active ("${schedule}") — press Ctrl+C to stop`);
  }
}
