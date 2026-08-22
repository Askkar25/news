// railway.ge/en/news — Georgian Railway (JSC), English news
//
// The listing page is a client-rendered Vue component that pulls its data
// from a custom WordPress REST route (`/wi/posts/`). It requires POST with a
// real multipart/form-data body (not urlencoded) and the locale-prefixed
// path to get English content — reverse-engineered from the theme bundle.
import axios from 'axios';
import { makeId, parseDate, absoluteUrl, resolvePublishedAt } from './_helpers.js';

const SOURCE = 'railway.ge';
const API_URL = 'https://www.railway.ge/en/wp-json/wi/posts/';
const BASE = 'https://www.railway.ge';

export async function scrape() {
  const form = new FormData();
  form.set('per_page', '20');
  form.set('paged', '1');
  form.set('type', 'post');
  form.set('lang', 'en');
  form.set('search_query', '');
  form.set('terms', '[]');
  form.set('metas', '[]');
  form.set('orderby_meta_key', '');

  const { data } = await axios.post(API_URL, form, { timeout: 20000 });
  const items = data?.data?.posts;
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const url = absoluteUrl(BASE, item.url);
    const summary = (item.more_text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    return {
      id: makeId(url),
      title: (item.title || '').replace(/\s+/g, ' ').trim(),
      url,
      source: SOURCE,
      ...resolvePublishedAt(parseDate(item.date)),
      scrapedAt: new Date().toISOString(),
      summary,
      // Article detail pages are the same Vue SPA shell, so the listing
      // excerpt is the best text available without a per-article browser render.
      fullText: summary,
      language: 'en',
    };
  }).filter((a) => a.title && a.url);
}
