// railway-technology.com/news — GlobalData Railway Technology news
//
// NOTE: as of this fix, this host returns a Varnish-level 403 ("cache-bma-...")
// to every plain HTTP client tried from this environment — curl with full
// browser headers, axios, and a real headless Chrome all got the same 403.
// That points to an edge/WAF rule blocking the request's source IP (likely a
// datacenter/cloud range) rather than anything fixable via headers or a
// browser engine. It may well succeed from a residential/office IP (e.g. the
// machine actually running the daily cron) — the improved headers below are
// worth keeping for that case, but don't expect this scraper to work from a
// typical cloud sandbox.
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchArticleText, resolvePublishedAt, DEFAULT_HEADERS } from './_helpers.js';

const SOURCE = 'railway-technology.com';
const NEWS_URL = 'https://www.railway-technology.com/news/';
const BASE = 'https://www.railway-technology.com';

export async function scrape() {
  let data;
  try {
    ({ data } = await axios.get(NEWS_URL, {
      timeout: 20000,
      headers: {
        ...DEFAULT_HEADERS,
        'Referer': BASE + '/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
    }));
  } catch (err) {
    const status = err.response?.status;
    if (status === 403) {
      throw new Error('blocked with HTTP 403 (edge/WAF rule, likely IP-based — see file header comment)');
    }
    throw err;
  }

  const $ = cheerio.load(data);

  // GlobalData sites use a specific article card structure
  const cardSelectors = [
    'article',
    '.article-listing',
    '.article-card',
    '.news-card',
    '.post',
    '[class*="ArticleCard"]',
    '[class*="article-item"]',
    '.category-content article',
    '.content-card',
  ];

  let $cards = $();
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length > 1) { $cards = found; break; }
  }

  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const titleEl = $el.find('h1 a, h2 a, h3 a, .article-title a, .title a, [class*="title"] a').first();
    const title = titleEl.text().trim();
    if (!title) return;

    const url = absoluteUrl(BASE, titleEl.attr('href'));
    if (!url) return;

    let publishedAt = null;
    const timeEl = $el.find('time').first();
    if (timeEl.length) publishedAt = parseDate(timeEl.attr('datetime') || timeEl.text());
    if (!publishedAt) {
      const dateEl = $el.find('.date, .article-date, .publish-date, [class*="date"]').first();
      if (dateEl.length) publishedAt = parseDate(dateEl.text());
    }

    const summary = $el.find('.article-excerpt, .excerpt, .description, .lead, p').first()
      .text().replace(/\s+/g, ' ').trim().slice(0, 500);

    articles.push({
      id: makeId(url),
      title,
      url,
      source: SOURCE,
      ...resolvePublishedAt(publishedAt),
      scrapedAt: new Date().toISOString(),
      summary,
      fullText: '',
      language: 'en',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleText(article.url, [
      '[class*="article-body"]',
      '[class*="ArticleBody"]',
      '.article-content',
      '.article__body',
      '.content-body',
    ]);
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
