import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDigestEntries, renderDigestHtml, getMondayOfWeek, matchArticlesToEntries } from './digest-generator.js';

test('parseDigestEntries splits a batch response into structured entries', () => {
  const batchText = [
    'New locomotive contract signed',
    'railfreight.com | August 20, 2026',
    'A summary sentence. Why it matters.',
    '---',
    'Second article title',
    'railjournal.com | August 21, 2026',
    'Another summary.',
  ].join('\n');

  const entries = parseDigestEntries(batchText);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    title: 'New locomotive contract signed',
    source: 'railfreight.com',
    publishedAt: 'August 20, 2026',
    summary: 'A summary sentence. Why it matters.',
  });
  assert.equal(entries[1].title, 'Second article title');
});

test('parseDigestEntries ignores empty/trailing separators', () => {
  const batchText = '\nTitle only entry\nSourceX | DateX\nSummary text\n---\n';
  const entries = parseDigestEntries(batchText);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Title only entry');
});

test('renderDigestHtml numbers articles, bolds the title as h3, and grays the source/date line', () => {
  const monday = getMondayOfWeek(new Date(2026, 7, 24));
  const html = renderDigestHtml(
    [
      { title: 'First <Story>', source: 'railfreight.com', publishedAt: '2026-08-20', summary: 'Body one.' },
      { title: 'Second Story', source: 'railjournal.com', publishedAt: '2026-08-21', summary: 'Body two.' },
    ],
    monday,
  );

  assert.match(html, /<h3[^>]*>1\. First &lt;Story&gt;<\/h3>/);
  assert.match(html, /<h3[^>]*>2\. Second Story<\/h3>/);
  assert.match(html, /color: #777777[^>]*>railfreight\.com \| 2026-08-20/);
  assert.match(html, /<p[^>]*>Body one\.<\/p>/);
});

test('matchArticlesToEntries pairs off duplicate source+date articles in order and reports the rest as missing', () => {
  const batchArticles = [
    { url: 'https://a', source: 'railways.kz', publishedAt: '2026-08-26' },
    { url: 'https://b', source: 'railways.kz', publishedAt: '2026-08-26' }, // duplicate source+date
    { url: 'https://c', source: 'railfreight.com', publishedAt: '2026-08-28' },
  ];
  // OpenAI's response only covered 2 of the 3 — 'b' got silently dropped —
  // and reformatted railfreight.com's date from '2026-08-28' to a long form.
  const parsedEntries = [
    { title: 'A', source: 'railways.kz', publishedAt: '2026-08-26', summary: '' },
    { title: 'C', source: 'railfreight.com', publishedAt: 'August 28, 2026', summary: '' },
  ];

  const { included, missing } = matchArticlesToEntries(batchArticles, parsedEntries);

  assert.deepEqual(included.map((a) => a.url), ['https://a', 'https://c']);
  assert.deepEqual(missing.map((a) => a.url), ['https://b']);
});

test('matchArticlesToEntries returns everything as missing when the response is empty', () => {
  const batchArticles = [{ url: 'https://a', source: 'railfreight.com', publishedAt: '2026-08-28' }];
  const { included, missing } = matchArticlesToEntries(batchArticles, []);

  assert.deepEqual(included, []);
  assert.deepEqual(missing.map((a) => a.url), ['https://a']);
});
