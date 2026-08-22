// railmarket.com/news/regions/cis — Railway market news, CIS region
//
// This site 403s plain axios/curl-with-Node's-TLS-stack requests (bot/TLS
// fingerprinting) even with full browser-like headers, but serves normal
// static HTML to a real browser engine — so both the listing and article
// pages are fetched through headless Chrome instead of axios.
//
// NOTE: from this environment, the listing page renders fine but every
// per-article page instead serves Cloudflare's "Performing security
// verification" interstitial (same managed-challenge behavior as ady.js/
// railjournal.js — may still pass from a clean, non-datacenter IP). Rather
// than fail the whole scrape, fetchArticlePageViaBrowser() already detects
// this (see _helpers.js) and returns '' / null instead of the challenge
// page's filler text, so article.fullText simply stays empty and the
// listing's excerpt (article.summary, if any) is what survives — this is a
// known, environment-dependent gap, not a parsing bug.
//
// Publish date: only "featured" hero cards on the listing show one at all
// (as plain "Category · Month Day, Year" text, not in any selectable date
// field) — regular cards (most of them) show no date whatsoever. Every
// article page, however, carries a reliable article:published_time meta tag
// and/or <time datetime> (confirmed by hand: a single one-off request got
// the real date fine), so fetchArticlePageViaBrowser() reads it from there
// and overrides whatever the listing pass fell back to. In practice this is
// subject to the same per-article Cloudflare block described above — an
// automated back-to-back scrape of all cards hit the challenge on every
// single one in this environment, same as fullText, so dateSource still
// comes out 'fallback' here. Not a logic bug; re-verify from wherever this
// actually runs in production.
import * as cheerio from 'cheerio';
import { makeId, parseDate, absoluteUrl, fetchRenderedHtml, fetchArticlePageViaBrowser, resolvePublishedAt } from './_helpers.js';

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
      ...resolvePublishedAt(publishedAt),
      scrapedAt: new Date().toISOString(),
      summary,
      fullText: '',
      language: 'en',
    });
  });

  for (const article of articles) {
    const { fullText, publishedAt } = await fetchArticlePageViaBrowser(
      article.url,
      ['.article-body', '.news-body', '.content-area', '.entry-content'],
    );
    article.fullText = fullText;
    if (!article.summary && fullText) article.summary = fullText.slice(0, 500);
    // The article page's date is far more reliable than whatever the
    // listing pass above could find (usually nothing) — prefer it when present.
    if (publishedAt) Object.assign(article, resolvePublishedAt(publishedAt));
  }

  return articles;
}
