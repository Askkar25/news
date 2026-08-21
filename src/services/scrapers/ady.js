// corp.ady.az/en/2/news/news — Azerbaijan Railways (ADY) English corporate news
//
// NOTE: this host sits behind Cloudflare's "Managed Challenge" (a JS/behavioral
// check, not a plain rate-limit). Neither plain axios nor a real headless
// Chrome (with or without stealth patches) gets past it from this
// environment — it may still pass from a clean, non-datacenter IP (e.g. the
// machine actually running the daily cron), which is why this goes through
// a real browser rather than giving up at the axios 403. When it's still
// blocked, scrape() throws a clearly labeled error instead of silently
// returning zero articles.
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchRenderedHtml, fetchArticleTextViaBrowser, today, isCloudflareChallenge } from './_helpers.js';

const SOURCE = 'corp.ady.az';
const NEWS_URL = 'https://corp.ady.az/en/2/news/news';
const BASE = 'https://corp.ady.az';

export async function scrape() {
  const html = await fetchRenderedHtml(NEWS_URL, { waitMs: 6000 });
  if (isCloudflareChallenge(html)) {
    throw new Error('blocked by Cloudflare managed challenge (see file header comment)');
  }

  const $ = cheerio.load(html);

  // ADY uses a custom CMS — common patterns for post-Soviet corporate sites
  const cardSelectors = [
    '.news-item',
    '.news__item',
    '.news-list li',
    '.newsList .item',
    'article',
    '.post',
    '.card',
    'ul.news li',
    '.views-row',
    'tr',          // some corporate sites use tables
  ];

  let $cards = $();
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length > 1) { $cards = found; break; }
  }

  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const titleEl = $el.find('h1 a, h2 a, h3 a, h4 a, .title a, .news-title a, a.title').first();
    let title = titleEl.text().trim();
    let href = titleEl.attr('href');

    if (!title) {
      $el.find('a[href]').each((_, a) => {
        const t = $(a).text().trim();
        if (t.length > 15) { title = t; href = $(a).attr('href'); return false; }
      });
    }
    if (!title || !href) return;

    const url = absoluteUrl(BASE, href);
    if (!url) return;

    let publishedAt = null;
    const timeEl = $el.find('time').first();
    if (timeEl.length) publishedAt = parseDate(timeEl.attr('datetime') || timeEl.text());
    if (!publishedAt) {
      const dateEl = $el.find('.date, .news-date, .published, span[class*="date"]').first();
      if (dateEl.length) publishedAt = parseDate(dateEl.text());
    }

    const summary = $el.find('.excerpt, .description, .anons, p').first()
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
    article.fullText = await fetchArticleTextViaBrowser(article.url, ['.news-detail', '.article-body', '.detail', '.content-body']);
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
