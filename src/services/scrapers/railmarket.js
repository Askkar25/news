// railmarket.com/news/regions/cis — Railway market news, CIS region
//
// This site 403s plain axios/curl-with-Node's-TLS-stack requests (bot/TLS
// fingerprinting) even with full browser-like headers, but serves normal
// static HTML to a real browser engine — so both the listing and article
// pages are fetched through headless Chrome instead of axios.
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchRenderedHtml, fetchArticleTextViaBrowser, today } from './_helpers.js';

const SOURCE = 'railmarket.com';
const NEWS_URL = 'https://railmarket.com/news/regions/cis';
const BASE = 'https://railmarket.com';

export async function scrape() {
  const html = await fetchRenderedHtml(NEWS_URL);
  const $ = cheerio.load(html);

  const cardSelectors = [
    'article',
    '.news-item',
    '.news__item',
    '.post',
    '.card',
    '.article-preview',
    '.article-card',
    'li.item',
    '.list-item',
  ];

  let $cards = $();
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length > 1) { $cards = found; break; }
  }

  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const titleEl = $el.find('h1 a, h2 a, h3 a, h4 a, .title a, .news-title a, .post-title a').first();
    const title = titleEl.text().trim();
    if (!title) return;

    const url = absoluteUrl(BASE, titleEl.attr('href'));
    if (!url) return;

    let publishedAt = null;
    const timeEl = $el.find('time').first();
    if (timeEl.length) publishedAt = parseDate(timeEl.attr('datetime') || timeEl.text());
    if (!publishedAt) {
      const dateEl = $el.find('.date, .news-date, .published, .post-date, span[class*="date"]').first();
      if (dateEl.length) publishedAt = parseDate(dateEl.text());
    }

    const summary = $el.find('.excerpt, .post-excerpt, .description, .lead, p').first()
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
    article.fullText = await fetchArticleTextViaBrowser(article.url, ['.article-body', '.news-body', '.content-area', '.entry-content']);
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
