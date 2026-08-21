// Cross-source deduplication — same story often runs on multiple sites with
// slightly different titles/wording. We dedupe on exact URL/id upstream
// (see scraper.js) and use fuzzy title overlap here to catch reprints.

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9Ѐ-ӿ\s]/gi, '') // keep latin/cyrillic letters, digits, spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(title) {
  return new Set(normalizeTitle(title).split(' ').filter((w) => w.length > 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.6;

/**
 * Given a flat list of articles from all sources, collapse near-duplicate
 * titles into a single entry — keeping whichever version has the longer
 * (presumably more detailed) fullText.
 */
export function dedupeArticles(articles) {
  const kept = [];

  for (const article of articles) {
    const tokens = tokenSet(article.title);
    const matchIndex = kept.findIndex((k) => jaccard(tokens, k.tokens) >= SIMILARITY_THRESHOLD);

    if (matchIndex === -1) {
      kept.push({ article, tokens });
      continue;
    }

    const existing = kept[matchIndex].article;
    const existingLen = existing.fullText?.length || 0;
    const newLen = article.fullText?.length || 0;
    if (newLen > existingLen) {
      kept[matchIndex] = { article, tokens };
    }
  }

  return kept.map((k) => k.article);
}
