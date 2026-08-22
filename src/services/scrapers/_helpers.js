import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import https from 'https';

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
};

// A few sites (rollingstockworld.ru, tcdd.gov.tr) serve an incomplete/broken
// TLS certificate chain that real browsers tolerate (they already trust the
// root CA) but Node's strict verification rejects. Scrapers for those hosts
// pass this agent explicitly — it is never applied globally.
export const INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

const RU_MONTHS = {
  'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04', 'мая': '05', 'июня': '06',
  'июля': '07', 'августа': '08', 'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12',
};

export function makeId(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, ' ');

  // Already an ISO date/datetime (e.g. a <time datetime="..."> attribute) —
  // the calendar date is right there in the string, unambiguous. Take it
  // directly rather than round-tripping through Date()/toISOString(), which
  // would silently shift it by a day whenever the scraping machine's local
  // timezone differs from the source's UTC offset.
  const iso = cleaned.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  // "19 августа 2026" — Russian "D MonthName YYYY"
  const ru = cleaned.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (ru) {
    const month = RU_MONTHS[ru[2].toLowerCase()];
    if (month) return `${ru[3]}-${month}-${ru[1].padStart(2, '0')}`;
  }

  // DD.MM.YYYY or DD/MM/YYYY — checked before the generic Date() parse below,
  // since e.g. "5.08.2026" would otherwise be silently misread by Date() as
  // the US-style month/day ordering (May 8th instead of August 5th).
  const dmy = cleaned.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Fallback: let Date() parse free-form formats like "August 6, 2025". These
  // carry no timezone of their own, so Date() reads them as local midnight —
  // pulling the date back out via local getters (not toISOString, which is
  // UTC) avoids the same day-shift bug.
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return formatLocalDate(d);
  return null;
}

export function absoluteUrl(baseUrl, href) {
  if (!href) return null;
  href = href.trim();
  if (href.startsWith('http')) return href;
  try {
    const base = new URL(baseUrl);
    return new URL(href, base.origin).toString();
  } catch {
    return null;
  }
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Resolve the publishedAt field consistently across all scrapers, tagging
 * whether the date actually came off the page (`parsed`) or had to fall back
 * to today's date because none was found/parseable (`fallback`). The tag
 * doesn't affect anything downstream (fallback articles still pass the
 * recency filter, same as before) — it's there so src/data/articles.json can
 * be inspected later to see which sources need better date selectors.
 * @param {string|null} parsed - result of parseDate() (or null if none found)
 */
export function resolvePublishedAt(parsed) {
  return parsed
    ? { publishedAt: parsed, dateSource: 'parsed' }
    : { publishedAt: today(), dateSource: 'fallback' };
}

const GENERIC_ARTICLE_SELECTORS = [
  'article .entry-content',
  'article .post-content',
  '.article-body',
  '.article__body',
  '.article__text',
  '.post-body',
  '.entry-content',
  '.td-post-content',
  '.jeg_post_content',
  '.news-detail',
  '.news__text',
  '.detail__text',
  '.content-body',
  'article',
  '.content',
  'main',
];

function extractBodyText($, prioritySelectors) {
  $('script, style, nav, header, footer, aside, .sidebar, .comments, .related, .widget, .advertisement').remove();

  for (const sel of [...prioritySelectors, ...GENERIC_ARTICLE_SELECTORS]) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.text().replace(/\s+/g, ' ').trim();
      if (text.length > 100) return text;
    }
  }
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
}

/**
 * Fetch and extract the main article body text from a URL.
 * @param {string} url
 * @param {string[]} prioritySelectors - site-specific selectors tried first
 * @param {object} axiosOptions - extra axios config (e.g. httpsAgent) merged into the request
 */
export async function fetchArticleText(url, prioritySelectors = [], axiosOptions = {}) {
  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: DEFAULT_HEADERS,
      ...axiosOptions,
    });
    // A per-article request can hit a bot-check interstitial even when the
    // listing page didn't — extracting "text" from that page would just
    // poison fullText/summary with the challenge copy instead of the article.
    if (isCloudflareChallenge(data)) return '';
    return extractBodyText(cheerio.load(data), prioritySelectors);
  } catch {
    return '';
  }
}

/**
 * Generic card parser — tries multiple selector strategies to extract articles
 * from a listing page already loaded into cheerio.
 */
export function parseCards($, baseUrl, options = {}) {
  const {
    cardSelectors = ['article', '.post', '.news-item', '.news__item', '.article-item'],
    titleSelectors = ['h1 a', 'h2 a', 'h3 a', 'h4 a', '.title a', '.article-title a'],
    dateSelectors = ['time', '.entry-date', '.post-date', '.date', '.news-date', '.published'],
    excerptSelectors = ['.entry-summary', '.excerpt', '.post-excerpt', '.news-excerpt', '.description', 'p'],
    language = 'en',
    source,
  } = options;

  let $cards = $();
  for (const sel of cardSelectors) {
    const found = $(sel);
    if (found.length > 1) { $cards = found; break; }
  }

  const articles = [];

  $cards.each((_, el) => {
    const $el = $(el);

    let title = '';
    let url = null;

    for (const sel of titleSelectors) {
      const a = $el.find(sel).first();
      if (a.length && a.text().trim()) {
        title = a.text().trim();
        url = absoluteUrl(baseUrl, a.attr('href'));
        break;
      }
    }
    if (!title || !url) return;

    let publishedAt = null;
    for (const sel of dateSelectors) {
      const el2 = $el.find(sel).first();
      if (el2.length) {
        publishedAt = parseDate(el2.attr('datetime') || el2.attr('data-date') || el2.text());
        if (publishedAt) break;
      }
    }

    let summary = '';
    for (const sel of excerptSelectors) {
      const el2 = $el.find(sel).first();
      if (el2.length) {
        summary = el2.text().replace(/\s+/g, ' ').trim().slice(0, 500);
        if (summary) break;
      }
    }

    articles.push({
      id: makeId(url),
      title,
      url,
      source,
      ...resolvePublishedAt(publishedAt),
      scrapedAt: new Date().toISOString(),
      summary,
      fullText: '',
      language,
    });
  });

  return articles;
}

// ---------------------------------------------------------------------------
// Puppeteer fallback — for sites that render their listing/article client-side
// (Vue/React SPA shells) or that block plain HTTP clients on TLS/bot-detection
// grounds but let a real browser through. A single browser instance is reused
// across the whole scrape cycle (and across daily cron runs) rather than
// relaunching Chromium per request.
let browserPromise = null;

async function getBrowser() {
  const puppeteer = (await import('puppeteer')).default;
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    browserPromise.catch(() => { browserPromise = null; });
  }
  let browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    browser = await getBrowser();
  }
  return browser;
}

/**
 * Render a page in a real (headless) browser and return the resulting HTML.
 * Use for JS-rendered SPA pages, or sites that reject axios/curl requests
 * outright (TLS/bot fingerprinting) but accept a real Chrome connection.
 */
export async function fetchRenderedHtml(url, { waitForSelector, timeout = 30000, waitMs = 0 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(DEFAULT_HEADERS['User-Agent']);
    await page.setExtraHTTPHeaders({ 'Accept-Language': DEFAULT_HEADERS['Accept-Language'] });
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    if (waitForSelector) {
      try { await page.waitForSelector(waitForSelector, { timeout: 15000 }); } catch { /* best effort */ }
    }
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    return await page.content();
  } finally {
    await page.close();
  }
}

/** Browser-rendered equivalent of fetchArticleText, for sites axios can't reach. */
export async function fetchArticleTextViaBrowser(url, prioritySelectors = [], options = {}) {
  try {
    const html = await fetchRenderedHtml(url, options);
    // Same reasoning as fetchArticleText: a per-article render can still
    // land on a Cloudflare challenge page even when the listing page didn't
    // (challenges can be per-request/session) — don't extract its filler
    // copy as if it were the article body.
    if (isCloudflareChallenge(html)) return '';
    return extractBodyText(cheerio.load(html), prioritySelectors);
  } catch {
    return '';
  }
}

/**
 * Navigate to a page in a real browser and capture the JSON body of the
 * first XHR/fetch response whose URL matches apiUrlPattern — for SPAs that
 * load their content from a same-origin JSON API the site doesn't expose
 * (or gates behind session/locale state) to a bare axios request.
 */
export async function fetchJsonViaBrowser(pageUrl, apiUrlPattern, { timeout = 30000 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(DEFAULT_HEADERS['User-Agent']);

    const jsonPromise = new Promise((resolve, reject) => {
      page.on('response', async (res) => {
        if (!apiUrlPattern.test(res.url())) return;
        try {
          resolve(await res.json());
        } catch (err) {
          reject(err);
        }
      });
    });

    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`timed out waiting for ${apiUrlPattern} response`)), timeout);
    });

    return await Promise.race([jsonPromise, timeoutPromise]);
  } finally {
    await page.close();
  }
}

/** Detects Cloudflare's "Just a moment..." managed-challenge interstitial. */
export function isCloudflareChallenge(html) {
  return /Just a moment\.\.\.|cf-browser-verification|Enable JavaScript and cookies to continue/i.test(html || '');
}
