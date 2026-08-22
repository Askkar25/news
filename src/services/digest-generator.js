// OpenAI-based weekly digest generation — turns the accumulated
// src/data/articles.json entries into the plain-text digest described in
// TASK.md section 4.
import OpenAI from 'openai';

const MODEL = process.env.OPENAI_DIGEST_MODEL || 'gpt-4o';

// How many articles to send to OpenAI per request. Weekly volume can run
// into the hundreds (406 after dedup in one observed run), so instead of
// one giant prompt (risking context/output-length limits) we batch and
// stitch the results together. 20 keeps each batch's expected completion
// (3-5 sentence summaries x 20 articles) comfortably under a 4096-token
// response.
const BATCH_SIZE = 20;
const MAX_SUMMARY_CHARS = 600;

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set (see .env.example)');
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

// Verbatim prompt from TASK.md section 4 ("OpenAI Prompt for Digest"),
// combined with the section's "Digest Format" example so the model's
// per-article shape matches what TASK.md documents (title / source+date /
// summary / --- separator).
const SYSTEM_PROMPT = `You are a railway industry analyst. Based on the articles below, create a
professional weekly digest in English. For each article, provide:
- The original title (translated to English if needed)
- A clear, concise summary of the key facts (3-5 sentences)
- Why this news is significant for the railway industry

Format each article exactly like this:
[Article Title]
[Source] | [Publication Date]
[Summary + why it matters]

---

Format the output as plain text with clear separators between articles.
Do not add any intro line, heading, or closing remarks — output only the
article entries, back to back.`;

/**
 * Monday of the week containing `date` (defaults to now). TASK.md's weekly
 * trigger runs "every Monday morning at 10:00", so running it on a Monday
 * should label that same day.
 */
export function getMondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatMondayLabel(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatMondayISO(date) {
  // Build from local date components (not toISOString(), which is UTC) so
  // this always agrees with formatMondayLabel()/getMondayOfWeek() — those
  // work in local time, and in any non-UTC timezone toISOString() can land
  // on the wrong calendar day.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Matches a "Source | Publication Date" line: exactly one '|', both sides
// short. This is what actually anchors article boundaries below — the '---'
// separator SYSTEM_PROMPT asks for is a nice-to-have, not load-bearing,
// because live testing showed OpenAI doesn't always include it even when
// it otherwise follows the title/meta/summary shape faithfully.
const META_LINE_RE = /^[^|]{1,80}\|[^|]{1,80}$/;

/**
 * Parse one batch's raw OpenAI response (the Title / "Source | Date" /
 * Summary shape from SYSTEM_PROMPT) into structured entries, so the HTML
 * renderer doesn't have to re-derive fields from free text.
 *
 * Deliberately doesn't split on '---': that separator is requested in the
 * prompt but not reliably produced, so entry boundaries are instead found by
 * scanning for "Source | Date" meta lines and taking the line right before
 * each one as that entry's title.
 */
export function parseDigestEntries(batchText) {
  const lines = batchText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^-{3,}$/.test(l)); // drop blank lines and standalone '---' separators

  const metaIndices = [];
  for (let i = 1; i < lines.length; i++) {
    if (META_LINE_RE.test(lines[i])) metaIndices.push(i);
  }

  return metaIndices
    .map((metaIdx, k) => {
      const titleIdx = metaIdx - 1;
      const summaryEnd = k + 1 < metaIndices.length ? metaIndices[k + 1] - 1 : lines.length;

      const meta = lines[metaIdx];
      const sepIndex = meta.indexOf('|');

      return {
        title: lines[titleIdx],
        source: meta.slice(0, sepIndex).trim(),
        publishedAt: meta.slice(sepIndex + 1).trim(),
        summary: lines.slice(metaIdx + 1, summaryEnd).join(' ').trim(),
      };
    })
    .filter((entry) => entry.title);
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render the digest as HTML: numbered articles, bold (h3) title, summary as
 * its own paragraph, and a separate gray "Source | Date" line.
 * @param {Array<{title: string, source: string, publishedAt: string, summary: string}>} entries
 * @param {Date} monday
 */
export function renderDigestHtml(entries, monday) {
  const intro = `Railway Industry News Digest — Week of ${escapeHtml(formatMondayLabel(monday))}`;

  const articlesHtml = entries.map((entry, i) => `
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 4px; font-size: 17px;">${i + 1}. ${escapeHtml(entry.title)}</h3>
      <p style="margin: 0 0 8px; color: #777777; font-size: 13px;">${escapeHtml(entry.source)}${entry.source && entry.publishedAt ? ' | ' : ''}${escapeHtml(entry.publishedAt)}</p>
      <p style="margin: 0; font-size: 15px; line-height: 1.5;">${escapeHtml(entry.summary)}</p>
    </div>`).join('\n');

  return `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #222222; max-width: 640px; margin: 0 auto; padding: 16px;">
    <h2 style="margin: 0 0 20px;">${intro}</h2>
    ${articlesHtml}
  </body>
</html>
`;
}

function formatArticleForPrompt(article, index) {
  const summary = (article.fullText || article.summary || '').slice(0, MAX_SUMMARY_CHARS);
  return `${index + 1}. Title: ${article.title}\nSource: ${article.source} | Published: ${article.publishedAt}\nContent: ${summary}`;
}

async function generateBatch(articles, { retries = 1 } = {}) {
  const openai = getClient();
  const articlesBlock = articles.map(formatArticleForPrompt).join('\n\n');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Articles:\n${articlesBlock}` },
        ],
      });
      const text = response.choices[0]?.message?.content?.trim();
      if (!text) throw new Error('OpenAI returned an empty digest batch');
      return text;
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Digest generation failed: ${err.message}`);
      }
      console.error(`[digest-generator] batch attempt ${attempt + 1} failed (${err.message}), retrying...`);
    }
  }
}

/**
 * Build the weekly digest from a list of articles.
 * @param {Array} articles
 * @param {Date} [referenceDate] - defaults to now; used to compute the
 *   "Week of [DATE]" intro line.
 * @returns {Promise<{text: string, entries: Array}>} `text` is the plain-text
 *   digest (saved to disk as before); `entries` is the flat, structured list
 *   of parsed articles used to render the HTML email.
 */
export async function generateDigest(articles, referenceDate = new Date()) {
  if (!articles.length) {
    throw new Error('No articles to build a digest from');
  }

  const monday = getMondayOfWeek(referenceDate);
  const intro = `Railway Industry News Digest — Week of ${formatMondayLabel(monday)}`;

  const batches = chunk(articles, BATCH_SIZE);
  const sections = [];
  const entries = [];
  for (const batch of batches) {
    const sectionText = await generateBatch(batch);
    sections.push(sectionText);
    entries.push(...parseDigestEntries(sectionText));
  }

  const text = `${intro}\n\n${sections.join('\n\n')}`.trim() + '\n';
  return { text, entries };
}
