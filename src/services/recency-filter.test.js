import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filterRecent } from './recency-filter.js';

const REF = new Date(2026, 7, 22); // Aug 22, 2026 (local)

function article(publishedAt) {
  return { title: 't', url: 'u', publishedAt };
}

test('keeps articles within maxDays', () => {
  const articles = [article('2026-08-22'), article('2026-08-18'), article('2026-08-19')];
  const result = filterRecent(articles, { maxDays: 4, referenceDate: REF });
  assert.equal(result.length, 3);
});

test('drops articles older than maxDays', () => {
  const articles = [article('2026-08-22'), article('2026-08-10')];
  const result = filterRecent(articles, { maxDays: 4, referenceDate: REF });
  assert.deepEqual(result.map((a) => a.publishedAt), ['2026-08-22']);
});

test('boundary: exactly maxDays old is kept', () => {
  const articles = [article('2026-08-18')]; // exactly 4 days before REF
  const result = filterRecent(articles, { maxDays: 4, referenceDate: REF });
  assert.equal(result.length, 1);
});

test('keeps articles with unparseable/missing publishedAt', () => {
  const articles = [article(''), article(undefined), article('not-a-date')];
  const result = filterRecent(articles, { maxDays: 4, referenceDate: REF });
  assert.equal(result.length, 3);
});
