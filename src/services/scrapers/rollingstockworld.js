// rollingstockworld.ru — Russian rolling stock industry news
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchArticleText, today, DEFAULT_HEADERS, INSECURE_HTTPS_AGENT } from './_helpers.js';

const SOURCE = 'rollingstockworld.ru';
const NEWS_URL = 'https://rollingstockworld.ru';
const BASE = 'https://rollingstockworld.ru';

export async function scrape() {
  // rollingstockworld.ru serves a broken/incomplete TLS certificate chain
  // that real browsers tolerate (they already trust the root) but Node's
  // strict verification rejects — hence the insecure agent, scoped to this
  // one host only.
  const { data } = await axios.get(NEWS_URL, {
    timeout: 20000,
    headers: DEFAULT_HEADERS,
    httpsAgent: INSECURE_HTTPS_AGENT,
  });
  const $ = cheerio.load(data);

  // The homepage has two card styles: a handful of featured `.blog-item`
  // cards (image + excerpt) and a longer `.blog-item2` list (title + tags only).
  const $cards = $('.blog-item, .blog-item2');
  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    let title = '';
    let url = null;
    $el.find('a[href]').each((_, a) => {
      const t = $(a).text().trim();
      if (t.length > 10) { title = t; url = absoluteUrl(BASE, $(a).attr('href')); return false; }
    });
    if (!title || !url) return;

    const publishedAt = parseDate($el.find('.date').first().text()) || today();
    const summary = $el.find('p').first().text().replace(/\s+/g, ' ').trim().slice(0, 500);

    articles.push({
      id: makeId(url),
      title,
      url,
      source: SOURCE,
      publishedAt,
      scrapedAt: new Date().toISOString(),
      summary,
      fullText: '',
      language: 'ru',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleText(
      article.url,
      ['.post-page .text', '.text'],
      { httpsAgent: INSECURE_HTTPS_AGENT },
    );
    if (!article.summary && article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
