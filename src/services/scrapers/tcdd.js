// tcdd.gov.tr/en/news — Turkish State Railways (TCDD) English news
//
// The site is a client-rendered SPA (empty <div id="app">) that fetches its
// news list from a same-origin JSON API. The API is reachable directly with
// axios, but which language it returns depends on session/locale state set
// up while actually visiting the page — so we drive a real browser to the
// /en/news page and capture that XHR's JSON response instead of guessing at
// headers/cookies.
import { makeId, parseDate, absoluteUrl, fetchJsonViaBrowser, resolvePublishedAt } from './_helpers.js';

const SOURCE = 'tcdd.gov.tr';
const NEWS_PAGE = 'https://www.tcdd.gov.tr/en/news';
const BASE = 'https://www.tcdd.gov.tr';

export async function scrape() {
  const json = await fetchJsonViaBrowser(NEWS_PAGE, /\/api\/v1\/news-list/);
  const items = json?.content;
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const url = absoluteUrl(BASE, `/en/news/${item.url}`);
    return {
      id: makeId(url),
      title: (item.title || '').trim(),
      url,
      source: SOURCE,
      ...resolvePublishedAt(parseDate(item.date)),
      scrapedAt: new Date().toISOString(),
      summary: (item.short || '').trim(),
      // Article detail pages are the same client-rendered SPA, so we settle
      // for the listing's short description rather than paying for a browser
      // render per article.
      fullText: (item.short || '').trim(),
      language: 'en',
    };
  }).filter((a) => a.title && a.url);
}
