// railfreight.com — European and global rail freight news
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchArticleText, today, DEFAULT_HEADERS } from './_helpers.js';

const SOURCE = 'railfreight.com';
const NEWS_URL = 'https://www.railfreight.com';
const BASE = 'https://www.railfreight.com';

export async function scrape() {
  const { data } = await axios.get(NEWS_URL, { timeout: 20000, headers: DEFAULT_HEADERS });
  const $ = cheerio.load(data);

  // Each card is <a href="..."><article class="summary">...</article></a> —
  // the anchor wraps the whole card rather than just the title.
  const $cards = $('article.summary');

  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    const title = $el.find('.post-title').first().text().trim();
    if (!title) return;

    const $link = $el.parent('a[href]').length ? $el.parent() : $el.closest('a[href]');
    const url = absoluteUrl(BASE, $link.attr('href'));
    if (!url) return;

    const timeEl = $el.find('time.pubdate').first();
    const publishedAt = parseDate(timeEl.attr('datetime') || timeEl.text()) || today();

    const summary = $el.find('.excerpt').first().text().replace(/\s+/g, ' ').trim().slice(0, 500);

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
    article.fullText = await fetchArticleText(article.url, ['.entry-content', '.post-content', '.article-body']);
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
