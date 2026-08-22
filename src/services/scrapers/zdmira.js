// zdmira.com/news — Russian railway news aggregator
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchArticleText, resolvePublishedAt, DEFAULT_HEADERS } from './_helpers.js';

const SOURCE = 'zdmira.com';
const NEWS_URL = 'https://zdmira.com/news';
const BASE = 'https://zdmira.com';

export async function scrape() {
  const { data } = await axios.get(NEWS_URL, { timeout: 20000, headers: DEFAULT_HEADERS });
  const $ = cheerio.load(data);

  // zdmira uses a grid of news cards — try several structural patterns
  const cardSelectors = [
    '.news-item',
    '.news__item',
    '.article-item',
    '.content-item',
    'article',
    '.post',
    '.item',
  ];

  let $cards = $();
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length > 1) { $cards = found; break; }
  }

  // Fallback: parse <li> or <div> rows that contain links + dates
  if (!$cards.length) {
    $cards = $('ul.news li, .news-list li, .newsList li');
  }

  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find('a[href]').first();
    const href = linkEl.attr('href');
    if (!href) return;
    const url = absoluteUrl(BASE, href);
    if (!url) return;

    const title =
      linkEl.attr('title') ||
      $el.find('h1, h2, h3, h4, .title, .news-title').first().text().trim() ||
      linkEl.text().trim();
    if (!title || title.length < 5) return;

    let publishedAt = null;
    const timeEl = $el.find('time').first();
    if (timeEl.length) publishedAt = parseDate(timeEl.attr('datetime') || timeEl.text());
    if (!publishedAt) {
      const dateEl = $el.find('.date, .news-date, .pub-date, .timestamp, span[class*="date"]').first();
      if (dateEl.length) publishedAt = parseDate(dateEl.text());
    }

    const summary = $el.find('.excerpt, .anons, .description, .news-text, p').first()
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
      language: 'ru',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleText(article.url, ['.news-detail', '.article__text', '.news__text']);
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
