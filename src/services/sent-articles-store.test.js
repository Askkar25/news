import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filterUnsent, pruneOldEntries, recordSentArticles } from './sent-articles-store.js';

test('filterUnsent drops articles whose url was already sent', () => {
  const articles = [{ url: 'https://a', title: 'A' }, { url: 'https://b', title: 'B' }];
  const sent = [{ url: 'https://a', sentDate: '2026-08-01T00:00:00.000Z' }];
  const result = filterUnsent(articles, sent);
  assert.deepEqual(result.map((a) => a.url), ['https://b']);
});

test('pruneOldEntries removes entries older than maxDays', () => {
  const ref = new Date('2026-08-22T00:00:00.000Z');
  const entries = [
    { url: 'https://old', sentDate: '2026-07-01T00:00:00.000Z' }, // > 30 days before ref
    { url: 'https://recent', sentDate: '2026-08-10T00:00:00.000Z' }, // within 30 days
  ];
  const result = pruneOldEntries(entries, { maxDays: 30, referenceDate: ref });
  assert.deepEqual(result.map((e) => e.url), ['https://recent']);
});

test('recordSentArticles appends new urls without duplicating existing ones', () => {
  const ref = new Date('2026-08-22T00:00:00.000Z');
  const existing = [{ url: 'https://a', sentDate: '2026-08-15T00:00:00.000Z' }];
  const result = recordSentArticles(['https://a', 'https://b'], existing, { maxDays: 30, referenceDate: ref });
  assert.deepEqual(result.map((e) => e.url).sort(), ['https://a', 'https://b']);
});

test('recordSentArticles prunes old entries in the same pass', () => {
  const ref = new Date('2026-08-22T00:00:00.000Z');
  const existing = [{ url: 'https://old', sentDate: '2026-01-01T00:00:00.000Z' }];
  const result = recordSentArticles(['https://new'], existing, { maxDays: 30, referenceDate: ref });
  assert.deepEqual(result.map((e) => e.url), ['https://new']);
});
