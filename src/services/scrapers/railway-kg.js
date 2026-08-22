// railway.kg/news — Kyrgyz Railway (KTZH), Russian news
//
// The site itself is a client-rendered Vue SPA shell, but it loads its news
// from a clean, unauthenticated JSON API — so we call that directly instead
// of rendering the SPA.
import axios from 'axios';
import { makeId, parseDate, absoluteUrl, resolvePublishedAt } from './_helpers.js';

const SOURCE = 'railway.kg';
const API_URL = 'https://api.railway.kg/api/news/?category=allnews';
const BASE = 'https://railway.kg';

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function scrape() {
  const { data } = await axios.get(API_URL, { timeout: 20000 });
  const items = data?.results;
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const url = absoluteUrl(BASE, `/news/${item.slug}`);
    const fullText = stripHtml(item.content_ru);
    return {
      id: makeId(url),
      title: (item.title_ru || '').trim(),
      url,
      source: SOURCE,
      ...resolvePublishedAt(parseDate(item.created)),
      scrapedAt: new Date().toISOString(),
      summary: fullText.slice(0, 500),
      fullText,
      language: 'ru',
    };
  }).filter((a) => a.title && a.url);
}
