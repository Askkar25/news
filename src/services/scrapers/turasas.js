// turasas.gov.tr/basin/haberler — Turkish State Railways (TÜRASAŞ) news
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchArticleText, resolvePublishedAt, DEFAULT_HEADERS } from './_helpers.js';

const SOURCE = 'turasas.gov.tr';
const NEWS_URL = 'https://www.turasas.gov.tr/basin/haberler';
const BASE = 'https://www.turasas.gov.tr';

export async function scrape() {
  const { data } = await axios.get(NEWS_URL, {
    timeout: 25000,
    headers: { ...DEFAULT_HEADERS, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const $ = cheerio.load(data);

  const $cards = $('.single-blog-style1');
  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const titleEl = $el.find('.text-holder h3 a').first();
    const title = titleEl.text().trim();
    if (!title) return;

    const url = absoluteUrl(BASE, titleEl.attr('href'));
    if (!url) return;

    const publishedAt = parseDate($el.find('.meta-info li').first().text());

    articles.push({
      id: makeId(url),
      title,
      url,
      source: SOURCE,
      ...resolvePublishedAt(publishedAt),
      scrapedAt: new Date().toISOString(),
      summary: '',
      fullText: '',
      language: 'tr',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleText(article.url, ['.detail-content', '.news-detail', '.article-body']);
    if (article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
