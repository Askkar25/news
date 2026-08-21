// railways.kz/en/news2026 — Kazakhstan Temir Zholy (KTZ) English news
// Note: the URL path contains the year; update NEWS_URL each year if needed.
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, absoluteUrl, fetchArticleText, today, DEFAULT_HEADERS } from './_helpers.js';

const SOURCE = 'railways.kz';
const BASE = 'https://railways.kz';

function newsUrl() {
  const year = new Date().getFullYear();
  return { url: `${BASE}/en/news${year}`, prefix: `/news${year}/` };
}

export async function scrape() {
  const { url: NEWS_URL, prefix } = newsUrl();
  // This page ships its entire news archive in one response (~1MB) rather
  // than paginating, which is what was blowing through the old 25s timeout.
  const { data } = await axios.get(NEWS_URL, { timeout: 45000, headers: DEFAULT_HEADERS });
  const $ = cheerio.load(data);

  // Styled-components hashes its class names per build, so we anchor on the
  // stable structural shape instead: a link into the news archive whose
  // sibling <h3> holds the title. Each card renders two such links (one
  // wrapping the thumbnail, one wrapping — in some layouts — the title
  // itself), so we dedupe by href.
  const seen = new Set();
  const articles = [];

  $(`a[href^="${prefix}"]`).each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href');
    if (!href || href === prefix || seen.has(href)) return; // skip the bare archive link / dupes

    const title = $a.parent().find('h3').first().text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    const url = absoluteUrl(BASE, href);
    if (!url) return;

    seen.add(href);
    articles.push({
      id: makeId(url),
      title,
      url,
      source: SOURCE,
      // No publish date is exposed on the listing cards themselves.
      publishedAt: today(),
      scrapedAt: new Date().toISOString(),
      summary: '',
      fullText: '',
      language: 'en',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleText(article.url, ['.news-detail', '.article-body', '.detail-text']);
    if (article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
