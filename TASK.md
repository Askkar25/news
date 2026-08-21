# Railway News Digest — Project Task

## Overview

Automated pipeline that scrapes railway industry news from specific websites daily,
filters relevant articles using AI, stores them locally, and sends a weekly digest
by email to colleagues every Monday at 10:00.

---

## 1. News Collection (Daily, Automatic)

### Sources (14 websites)

| # | URL | Language |
|---|-----|----------|
| 1 | https://zdmira.com/news | Russian |
| 2 | https://rollingstockworld.ru | Russian |
| 3 | https://www.railway.supply/news-en | English |
| 4 | https://www.tcdd.gov.tr/en/news | English |
| 5 | https://railmarket.com/news/regions/cis | English |
| 6 | https://www.turasas.gov.tr/basin/haberler | Turkish |
| 7 | https://corp.ady.az/en/2/news/news | English |
| 8 | https://www.railway.ge/en/news | English |
| 9 | https://railways.kz/en/news2026 | English |
| 10 | https://railway.kg/news | Russian |
| 11 | https://www.railway-technology.com/news | English |
| 12 | https://www.railfreight.com | English |
| 13 | https://railway-news.com/news | English |
| 14 | https://www.railjournal.com/news | English |

**Note:** None of the sites have RSS feeds — HTML scraping required (Cheerio or Puppeteer).

### Scraping Schedule
- Run daily (cron job while computer is on)
- Collect: article title, URL, publication date, summary/body text

---

## 2. AI Filtering (After Each Scrape)

After collecting raw articles, send each one to OpenAI API for relevance filtering.

### Filter Criteria — include article ONLY if it matches one or more of:

1. **Locomotive contracts/deliveries** — negotiations, contracts, memorandums, or actual
   deliveries of locomotives. Priority countries:
   Kazakhstan, Kyrgyzstan, Azerbaijan, Georgia, Uzbekistan, Turkmenistan, Tajikistan,
   Russia, Belarus, Moldova, Ukraine, Armenia, Latvia, Lithuania, Estonia,
   Finland, Mongolia, Turkey

2. **New railway projects** — construction of new railway lines, infrastructure
   development. Same priority countries as above.

3. **Locomotive modernization projects** — upgrades, refurbishment, or modernization
   of existing locomotive fleets in the priority countries listed above.

4. **New locomotive/technology development** — R&D and testing of new locomotive types,
   especially: battery (accumulator), hybrid, hydrogen, gas-diesel locomotives

5. **Major manufacturer news** — contracts, deliveries, or significant news about:
   CRRC, Alstom, Wabtec, Progress Rail, Stadler, Siemens Mobility, CAF, Talgo,
   Transmashholding, and other major locomotive manufacturers

6. **Executive appointments** — leadership changes in state railway companies
   in the priority countries listed above

7. **Company development plans** — strategic plans, investment programs of state
   railway companies in the priority countries listed above

### Deduplication
- If the same news appears on multiple sites, keep only ONE version
  (the most detailed/informative one)
- Check for duplicates by comparing article titles and URLs before saving

### AI Prompt for Filtering
Send the following to OpenAI for each article:

```
You are an assistant monitoring the railway industry.
Determine if this article matches ANY of these criteria:
1. Locomotive contracts, negotiations, memorandums, or deliveries (especially in CIS/Eastern European/Nordic countries)
2. New railway construction projects in: Kazakhstan, Kyrgyzstan, Azerbaijan, Georgia, Uzbekistan, Turkmenistan, Tajikistan, Russia, Belarus, Moldova, Ukraine, Armenia, Latvia, Lithuania, Estonia, Finland, Mongolia, Turkey
3. Locomotive modernization projects (upgrades, refurbishment of existing fleets) in the countries listed above
4. Development or testing of new locomotive technologies (battery, hybrid, hydrogen, gas-diesel)
5. News about major locomotive manufacturers: CRRC, Alstom, Wabtec, Progress Rail, Stadler, Siemens Mobility, CAF, Talgo, Transmashholding
6. Executive appointments at state railway companies in the countries listed above
7. Strategic development plans of state railway companies in the countries listed above

Article title: [TITLE]
Article content: [CONTENT]

Reply with ONLY: YES or NO
```

---

## 3. Storage

- Save filtered articles to: `src/data/articles.json`
- Each article entry:
```json
{
  "id": "unique-hash-of-url",
  "title": "Article title",
  "url": "https://source-url.com/article",
  "source": "railway-news.com",
  "publishedAt": "2026-08-20",
  "scrapedAt": "2026-08-20T09:00:00Z",
  "summary": "First 500 chars of article text",
  "fullText": "Full article text",
  "language": "en"
}
```

---

## 4. Weekly Digest Generation (Manual trigger every Monday)

### Trigger
Run manually every Monday morning at 10:00:
```bash
node src/digest.js
```

### Digest Format
- Language: **English**
- Format: **Plain text**
- Structure per article:
  ```
  [Article Title]
  [Source] | [Publication Date]
  [Article text / summary]

  ---
  ```

### OpenAI Prompt for Digest
```
You are a railway industry analyst. Based on the articles below, create a
professional weekly digest in English. For each article, provide:
- The original title (translated to English if needed)
- A clear, concise summary of the key facts (3-5 sentences)
- Why this news is significant for the railway industry

Articles:
[LIST OF ARTICLES]

Format the output as plain text with clear separators between articles.
Start with a brief intro line: "Railway Industry News Digest — Week of [DATE]"
```

---

## 5. Email Distribution (Together with Digest Generation)

### Configuration (via .env file)
```
EMAIL_HOST=smtp.company.com
EMAIL_PORT=587
EMAIL_USER=your-email@company.com
EMAIL_PASS=your-password
EMAIL_FROM="Railway Digest <your-email@company.com>"
EMAIL_TO=colleague1@company.com,colleague2@company.com,colleague3@company.com
```

### Email Format
- **Subject:** `Railway News Digest — Week of [Monday date]`
- **Body:** Plain text digest generated by OpenAI
- **Recipients:** 3–4 colleagues (configured in .env)

---

## 6. Technical Stack

- **Runtime:** Node.js 20 (required — package.json enforces `>=20.20.0 <21`)
- **Scraping:** Cheerio + axios (static sites), Puppeteer if needed (JS-rendered sites)
- **AI Filtering & Digest:** OpenAI API (model: gpt-4o or similar)
- **Storage:** Local JSON file (`src/data/articles.json`)
- **Scheduling:** node-cron (daily scraping)
- **Email:** Nodemailer (corporate SMTP)
- **Base project:** Fork of AI-agents-incubator/news (news-digest-pipeline)

---

## 7. Workflow Summary

```
DAILY (automatic, while PC is on):
  node-cron → scraper.js → 14 websites
            → raw articles
            → OpenAI filter (YES/NO)
            → deduplicate
            → save to articles.json

WEEKLY MONDAY 10:00 (manual):
  node src/digest.js
            → read articles.json
            → OpenAI generate digest
            → send email via SMTP
            → clear articles.json for next week
```

---

## 8. Files to Create

| File | Purpose |
|------|---------|
| `src/services/scraper.js` | Main scraper — loops through all 14 sites |
| `src/services/scrapers/railway-news.js` | Scraper for railway-news.com |
| `src/services/scrapers/zdmira.js` | Scraper for zdmira.com (Russian) |
| `src/services/scrapers/[site].js` | One file per site |
| `src/services/filter.js` | OpenAI filtering logic |
| `src/services/deduplicator.js` | Duplicate detection |
| `src/services/storage.js` | Read/write articles.json |
| `src/services/digest.js` | OpenAI digest generation |
| `src/services/emailer.js` | Nodemailer email sending |
| `src/digest.js` | Entry point for manual digest + send |
| `src/data/articles.json` | Accumulated filtered articles |
| `.env` | API keys, SMTP config, recipient emails |

---

*This project is a modification of the open-source AI-agents-incubator/news pipeline,
adapted for railway industry monitoring with email distribution instead of Telegram/Facebook.*
