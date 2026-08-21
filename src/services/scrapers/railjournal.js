// railjournal.com/news — International Railway Journal
//
// NOTE: this host sits behind Cloudflare's "Managed Challenge". Neither plain
// axios nor a real headless Chrome (with or without stealth patches) gets
// past it from this environment — it may still pass from a clean,
// non-datacenter IP (e.g. the machine actually running the daily cron),
// which is why this goes through a real browser rather than giving up at
// the axios 403. When it's still blocked, scrape() throws a clearly labeled
// error instead of silently returning zero articles.
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchRenderedHtml, fetchArticleTextViaBrowser, today, isCloudflareChallenge } from './_helpers.js';

const SOURCE = 'railjournal.com';
const NEWS_URL = 'https://www.railjournal.com/news';
const BASE = 'https://www.railjournal.com';

export async function scrape() {
  const html = await fetchRenderedHtml(NEWS_URL, { waitMs: 6000 });
  if (isCloudflareChallenge(html)) {
    throw new Error('blocked by Cloudflare managed challenge (see file header comment)');
  }

  const $ = cheerio.load(html);

  // IRJ uses a professional publication CMS — likely WordPress or similar
  const cardSelectors = [
    'article',
    '.post',
    '.news-item',
    '.article-card',
    '.news-card',
    '.entry',
    '.story',
    '.content-item',
    '[class*="ArticleCard"]',
    '[class*="NewsCard"]',
  ];

  let $cards = $();
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length > 1) { $cards = found; break; }
  }

  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const titleEl = $el.find('h1 a, h2 a, h3 a, h4 a, .entry-title a, .article-title a, .title a').first();
    const title = titleEl.text().trim();
    if (!title) return;

    const url = absoluteUrl(BASE, titleEl.attr('href'));
    if (!url) return;

    let publishedAt = null;
    const timeEl = $el.find('time').first();
    if (timeEl.length) publishedAt = parseDate(timeEl.attr('datetime') || timeEl.text());
    if (!publishedAt) {
      const dateEl = $el.find('.entry-date, .post-date, .date, .published, [class*="date"]').first();
      if (dateEl.length) publishedAt = parseDate(dateEl.text());
    }

    const summary = $el.find('.entry-summary, .excerpt, .article-excerpt, .teaser, p').first()
      .text().replace(/\s+/g, ' ').trim().slice(0, 500);

    articles.push({
      id: makeId(url),
      title,
      url,
      source: SOURCE,
      publishedAt: publishedAt || today(),
      scrapedAt: new Date().toISOString(),
      summary,
      fullText: '',
      language: 'en',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleTextViaBrowser(article.url, [
      '.entry-content',
      '.article-body',
      '.post-content',
      '.article__body',
      '.content-body',
    ]);
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
