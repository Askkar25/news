// OpenAI-based relevance filter — keeps only articles matching the railway
// industry criteria defined in TASK.md.
import OpenAI from 'openai';

const MODEL = process.env.OPENAI_FILTER_MODEL || 'gpt-4o-mini';
const MAX_CONTENT_CHARS = 4000;

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

const SYSTEM_PROMPT = `You are an assistant monitoring the railway industry.
Determine if this article matches ANY of these criteria:
1. Locomotive contracts, negotiations, memorandums, or deliveries (especially in CIS/Eastern European/Nordic countries)
2. New railway construction projects in: Kazakhstan, Kyrgyzstan, Azerbaijan, Georgia, Uzbekistan, Turkmenistan, Tajikistan, Russia, Belarus, Moldova, Ukraine, Armenia, Latvia, Lithuania, Estonia, Finland, Mongolia, Turkey
3. Locomotive modernization projects (upgrades, refurbishment of existing fleets) in the countries listed above
4. Development or testing of new locomotive technologies (battery, hybrid, hydrogen, gas-diesel)
5. News about major locomotive manufacturers: CRRC, Alstom, Wabtec, Progress Rail, Stadler, Siemens Mobility, CAF, Talgo, Transmashholding
6. Executive appointments at state railway companies in the countries listed above
7. Strategic development plans of state railway companies in the countries listed above

Reply with ONLY: YES or NO`;

/**
 * @param {{title: string, summary?: string, fullText?: string}} article
 * @returns {Promise<boolean>}
 */
export async function isRelevant(article) {
  const openai = getClient();
  const content = (article.fullText || article.summary || '').slice(0, MAX_CONTENT_CHARS);

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Article title: ${article.title}\nArticle content: ${content}` },
    ],
  });

  const answer = response.choices[0]?.message?.content?.trim().toUpperCase() || '';
  return answer.startsWith('YES');
}

/**
 * Run isRelevant over a list of articles with limited concurrency so we
 * don't fire hundreds of parallel OpenAI requests at once.
 */
export async function filterRelevant(articles, concurrency = 3) {
  const results = new Array(articles.length);
  let cursor = 0;

  async function worker() {
    while (cursor < articles.length) {
      const i = cursor++;
      const article = articles[i];
      try {
        results[i] = await isRelevant(article);
      } catch (err) {
        console.error(`[filter] error for "${article.title}": ${err.message}`);
        results[i] = false;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, articles.length) }, worker);
  await Promise.all(workers);

  return articles.filter((_, i) => results[i]);
}
