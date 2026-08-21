// railway-news.com/news — English-language railway industry news
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchArticleText, today, DEFAULT_HEADERS } from './_helpers.js';

const SOURCE = 'railway-news.com';
const NEWS_URL = 'https://railway-news.com/news';
const BASE = 'https://railway-news.com';

export async function scrape() {
  const { data } = await axios.get(NEWS_URL, { timeout: 20000, headers: DEFAULT_HEADERS });
  const $ = cheerio.load(data);

  const $cards = $('li.cards__item');
  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const link = $el.find('a.cards__heading__link').first();
    const title = link.find('.cards__heading').first().text().trim();
    if (!title) return;

    const url = absoluteUrl(BASE, link.attr('href'));
    if (!url) return;

    const timeEl = link.find('time.card__timestamp').first();
    const publishedAt = parseDate(timeEl.attr('datetime') || timeEl.text()) || today();

    const summary = link.find('.cards__body').first().text().replace(/\s+/g, ' ').trim().slice(0, 500);

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
