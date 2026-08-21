// railway.supply/news-en — railway supply industry news, English section
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchArticleText, today, DEFAULT_HEADERS } from './_helpers.js';

const SOURCE = 'railway.supply';
const NEWS_URL = 'https://www.railway.supply/news-en';
const BASE = 'https://www.railway.supply';

export async function scrape() {
  const { data } = await axios.get(NEWS_URL, { timeout: 20000, headers: DEFAULT_HEADERS });
  const $ = cheerio.load(data);

  const $cards = $('.post-wrapper');
  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const titleEl = $el.find('p.title a').first();
    const title = titleEl.text().trim();
    if (!title) return;

    const url = absoluteUrl(BASE, titleEl.attr('href'));
    if (!url) return;

    const publishedAt = parseDate($el.find('.publish-date').first().text()) || today();

    const summary = $el.find('.post-description').first().text().replace(/\s+/g, ' ').trim().slice(0, 500);

    articles.push({
      id: makeId(url),
      title,
      url,
      source: SOURCE,
      publishedAt,
      scrapedAt: new Date().toISOString(),
      summary,
      fullText: '',
      language: 'en',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleText(article.url, ['.entry-content', '.post-content', '.article-content']);
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
