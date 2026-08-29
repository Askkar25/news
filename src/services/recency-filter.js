// Keeps only articles published within the last N days — the daily scrape
// cycle runs every day, so anything older than that window is either a
// re-scrape of an already-seen backlog entry or a listing-page date the site
// hasn't refreshed. Runs after dedupe and before the (costlier) OpenAI
// relevance filter, so we don't spend API calls on stale articles.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string} publishedAt - 'YYYY-MM-DD'
 * @param {Date} referenceDate
 * @returns {number|null} whole days between publishedAt and referenceDate, or
 *   null if publishedAt doesn't parse (kept rather than dropped — see below).
 */
function daysAgo(publishedAt, referenceDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(publishedAt || '');
  if (!match) return null;

  const published = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  return Math.round((today - published) / MS_PER_DAY);
}

/**
 * @param {Array} articles
 * @param {{maxDays?: number, referenceDate?: Date}} [options]
 */
export function filterRecent(articles, { maxDays = 10, referenceDate = new Date() } = {}) {
  return articles.filter((article) => {
    const age = daysAgo(article.publishedAt, referenceDate);
    // Unparseable/missing publishedAt: keep the article rather than silently
    // drop it — the AI relevance filter downstream is a better place to lose
    // articles than a date field neither today's scraper output nor a
    // 'fallback' dateSource can make sense of.
    if (age === null) return true;
    return age <= maxDays;
  });
}
