// MarketIntel — Automated Scan Script
// Runs via GitHub Actions at 07:00, 15:00, 23:00 UK time
// Pulls Trump Truth Social posts, filters for market relevance, then full analysis

const https = require('https');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!ANTHROPIC_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// ── Fetch Trump Truth Social RSS ─────────────────────────────────────────────
async function fetchTrumpPosts() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'truthsocial.com',
      path: '/@realDonaldTrump.rss',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketIntelBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      timeout: 12000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const items = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;
          while ((match = itemRegex.exec(data)) !== null && items.length < 15) {
            const item = match[1];
            const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                           item.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || '';
            const desc  = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                           item.match(/<description>(.*?)<\/description>/))?.[1]?.trim() || '';
            const date  = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || '';

            const clean = (s) => s.replace(/<[^>]+>/g, '')
              .replace(/&amp;/g,'&').replace(/&lt;/g,'<')
              .replace(/&gt;/g,'>').replace(/&quot;/g,'"')
              .replace(/&#39;/g,"'").trim();

            const content = clean(desc) || clean(title);
            if (content) items.push({ title: clean(title), content, date });
          }
          console.log(`✓ Fetched ${items.length} raw Truth Social posts`);
          resolve(items);
        } catch (err) {
          console.log('⚠ Failed to parse Truth Social RSS:', err.message);
          resolve([]);
        }
      });
    });

    req.on('error', (err) => { console.log('⚠ Truth Social fetch error:', err.message); resolve([]); });
    req.on('timeout', () => { console.log('⚠ Truth Social timeout'); req.destroy(); resolve([]); });
    req.end();
  });
}

// ── Filter posts for market relevance using Claude Haiku ─────────────────────
async function filterMarketRelevantPosts(posts) {
  if (!posts.length) return [];

  const numbered = posts.map((p, i) =>
    `[${i}] ${p.date}\n${p.content}`
  ).join('\n\n---\n\n');

  const filterPrompt = `You are a financial markets relevance filter. 

Analyse these Truth Social posts from Donald Trump and return ONLY the index numbers of posts that are relevant to financial markets.

A post IS relevant if it mentions any of:
- Tariffs, trade deals, trade wars, import/export duties
- Sanctions against any country
- Interest rates, the Federal Reserve, Jerome Powell
- The US dollar, inflation, deflation, recession
- Stock market, S&P 500, Nasdaq, Dow Jones, Wall Street
- Specific companies or industries (e.g. Apple, Tesla, oil companies, banks)
- Oil, gas, energy prices
- Gold, silver, commodities
- Crypto, Bitcoin
- China, EU, Russia, Iran, North Korea, NATO (as economic/military threats that affect markets)
- Military action, war threats, sanctions (geopolitical risk)
- Government spending, debt ceiling, budget
- Jobs, unemployment, economy

A post is NOT relevant if it only mentions:
- Religion, holidays, personal congratulations
- Sports, entertainment, celebrities
- Domestic political attacks with no market angle
- Social issues unrelated to economy or trade

POSTS TO ANALYSE:
${numbered}

Return ONLY a JSON array of relevant post index numbers. Examples: [0,2,5] or [] if none relevant.
Return nothing else — no explanation, no markdown, just the JSON array.`;

  try {
    const response = await callAnthropic(filterPrompt, 'claude-haiku-4-5-20251001', 200);
    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/```json|```/g, '')
      .trim();

    const indices = JSON.parse(raw);
    if (!Array.isArray(indices)) return [];

    const relevant = indices
      .filter(i => typeof i === 'number' && i >= 0 && i < posts.length)
      .map(i => posts[i]);

    console.log(`✓ Filter kept ${relevant.length}/${posts.length} market-relevant posts`);
    if (relevant.length) {
      relevant.forEach((p, i) => console.log(`  → Post ${i+1}: ${p.content.slice(0, 80)}...`));
    } else {
      console.log('  → No market-relevant Trump posts this scan');
    }

    return relevant;
  } catch (err) {
    console.log('⚠ Filter error — using all posts as fallback:', err.message);
    return posts.slice(0, 5);
  }
}

// ── Format filtered Trump posts for main prompt ───────────────────────────────
function formatTrumpPosts(posts) {
  if (!posts.length) return 'No market-relevant Truth Social posts in this scan window.';
  return posts.map((p, i) =>
    `Post ${i + 1} [${p.date}]:\n${p.content}`
  ).join('\n\n');
}

// ── Call Anthropic API (reusable) ─────────────────────────────────────────────
async function callAnthropic(prompt, model = 'claude-sonnet-4-6', maxTokens = 4000, useWebSearch = false) {
  return new Promise((resolve, reject) => {
    const bodyObj = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    };
    if (useWebSearch) {
      bodyObj.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const body = JSON.stringify(bodyObj);

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { reject(new Error(parsed.error.message)); return; }
          resolve(parsed);
        } catch (err) { reject(err); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Save to Supabase ──────────────────────────────────────────────────────────
async function saveToSupabase(result) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify([result]);
    const url = new URL(`${SUPABASE_URL}/rest/v1/scans`);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✓ Saved to Supabase');
          resolve();
        } else {
          reject(new Error(`Supabase error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/London'
  });
  const timeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
  });

  console.log(`\n🔍 MarketIntel Scan — ${dateStr} at ${timeStr} UK\n`);

  // Step 1 — Fetch raw Truth Social posts
  console.log('📡 Step 1: Fetching Trump Truth Social posts...');
  const rawPosts = await fetchTrumpPosts();

  // Step 2 — Filter for market relevance (Haiku — fast & cheap)
  let relevantPosts = [];
  if (rawPosts.length > 0) {
    console.log('\n🔎 Step 2: Filtering for market-relevant posts...');
    relevantPosts = await filterMarketRelevantPosts(rawPosts);
  } else {
    console.log('⚠ No posts to filter — skipping filter step');
  }

  const trumpSection = formatTrumpPosts(relevantPosts);

  // Step 3 — Full analysis with Sonnet + web search
  console.log('\n🤖 Step 3: Running full market analysis with web search...');
  const prompt = `You are a senior multi-asset macro analyst for KJC Capital.
Today is ${dateStr} at ${timeStr} UK time.

TRUMP TRUTH SOCIAL POSTS — MARKET RELEVANT ONLY (pre-filtered):
${trumpSection}

Your task:
1. Analyse each Trump post above — assess the specific market impact (which pairs, which direction, price levels)
2. Search the web for: Forex Factory red events today, active geopolitical conflicts affecting markets, central bank decisions and speeches, major equity index moves, commodity shifts, crypto moves
3. For EVERY significant event produce detailed pair-by-pair FX analysis with specific price levels

Return ONLY valid JSON with no markdown fences:
{
  "scan_time": "${timeStr}",
  "scan_date": "${dateStr}",
  "events": [
    {
      "id": "unique_string",
      "type": "trump|geopolitical|central-bank|economic|equities|commodities|crypto",
      "urgent": false,
      "impact": "HIGH|MEDIUM|LOW",
      "source": "string",
      "headline": "max 15 words",
      "context": "2-3 sentences with specific details",
      "time": "HH:MM",
      "pairs": [
        {
          "pair": "EUR/USD",
          "direction": "bullish|bearish|neutral",
          "strength": 75,
          "analysis": "one sentence with specific price levels"
        }
      ],
      "overall": "bullish|bearish|neutral|mixed",
      "signal": "specific actionable signal with entry zone, target and stop"
    }
  ],
  "urgent_alerts": ["string"],
  "sentiment": {
    "USD": 0, "EUR": 0, "GBP": 0, "JPY": 0,
    "CHF": 0, "AUD": 0, "CAD": 0,
    "Gold": 0, "Oil": 0, "BTC": 0
  },
  "setups": ["pair — direction — entry — target — stop — R:R"],
  "market_summary": "4 paragraph executive brief: 1) Trump/political impact 2) macro/economic data 3) key FX setups 4) risk events next 24h"
}`;

  let result;
  try {
    const response = await callAnthropic(prompt, 'claude-sonnet-4-6', 4000, true);
    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/```json|```/g, '')
      .trim();

    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    if (s === -1) throw new Error('No JSON in response');

    result = JSON.parse(raw.slice(s, e + 1));
    result.event_count = (result.events || []).length;
    result.trump_posts_found    = rawPosts.length;
    result.trump_posts_relevant = relevantPosts.length;

    console.log(`✓ Got ${result.event_count} events`);
    console.log(`✓ Trump: ${rawPosts.length} posts fetched, ${relevantPosts.length} market-relevant`);
  } catch (err) {
    console.error('✗ Claude API error:', err.message);
    process.exit(1);
  }

  // Step 4 — Save to Supabase
  console.log('\n💾 Step 4: Saving to Supabase...');
  try {
    await saveToSupabase(result);
  } catch (err) {
    console.error('✗ Supabase save error:', err.message);
    process.exit(1);
  }

  console.log(`\n✅ Scan complete — ${result.event_count} events | ${result.trump_posts_relevant} Trump posts used\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
