// railways.kz/ru/news2026 — Kazakhstan Temir Zholy (KTZ) Russian news
// Note: the URL path contains the year; update NEWS_URL each year if needed.
//
// Switched from the English (/en/) listing to the Russian (/ru/) one: same
// site/template/dates-on-card structure, but the Russian page is updated
// noticeably more often — at last check the freshest article on /en/ was
// 5 days stale while /ru/ had one from today.
//
// railways.kz serves a broken/incomplete TLS certificate chain that real
// browsers tolerate (they already trust the root) but Node's strict
// verification rejects with "unable to verify the first certificate" — same
// issue as rollingstockworld.ru, hence the same insecure agent, scoped to
// this one host only.
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeId, absoluteUrl, parseDate, fetchArticleText, resolvePublishedAt, DEFAULT_HEADERS, INSECURE_HTTPS_AGENT } from './_helpers.js';

const SOURCE = 'railways.kz';
const BASE = 'https://railways.kz';

function newsUrl() {
  const year = new Date().getFullYear();
  return { url: `${BASE}/ru/news${year}`, prefix: `/news${year}/` };
}

export async function scrape() {
  const { url: NEWS_URL, prefix } = newsUrl();
  // This page ships its entire news archive in one response (~1MB) rather
  // than paginating, which is what was blowing through the old 25s timeout.
  const { data } = await axios.get(NEWS_URL, {
    timeout: 45000,
    headers: DEFAULT_HEADERS,
    httpsAgent: INSECURE_HTTPS_AGENT,
  });
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

    // The publish date IS on the card — it just lives in a sibling block
    // ($a's grandparent, not parent), as plain "DD.MM.YYYY" text with no
    // <time> tag or date-ish class/attribute to select on (and, per the
    // comment above, styled-components' hashed class names can't be relied
    // on directly either). So match by the date-shaped text itself instead
    // of a selector.
    let publishedAt = null;
    $a.parent().parent().find('div').each((_, div) => {
      const text = $(div).text().trim();
      if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)) {
        publishedAt = parseDate(text);
        return false; // stop at the first match
      }
    });

    seen.add(href);
    articles.push({
      id: makeId(url),
      title,
      url,
      source: SOURCE,
      ...resolvePublishedAt(publishedAt),
      scrapedAt: new Date().toISOString(),
      summary: '',
      fullText: '',
      language: 'ru',
    });
  });

  for (const article of articles) {
    article.fullText = await fetchArticleText(
      article.url,
      ['.news-detail', '.article-body', '.detail-text'],
      { httpsAgent: INSECURE_HTTPS_AGENT },
    );
    if (article.fullText) article.summary = article.fullText.slice(0, 500);
  }

  return articles;
}
