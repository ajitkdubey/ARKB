#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_TO = 'ajit@openexa.com';
const DEFAULT_ACCOUNT = 'openexa20@gmail.com';
const MAX_SOURCE_CHARS = 6000;

const SOURCES = [
  {
    key: 'fed',
    name: 'Federal Reserve rate decision',
    url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260318a.htm',
  },
  {
    key: 'cnbc',
    name: 'CNBC Markets',
    url: 'https://www.cnbc.com/markets/',
  },
  {
    key: 'coindesk',
    name: 'CoinDesk Markets',
    url: 'https://www.coindesk.com/markets',
  },
  {
    key: 'ibkr',
    name: 'Interactive Brokers system status',
    url: 'https://www.interactivebrokers.com/en/software/systemStatus.php',
  },
  {
    key: 'falconx',
    name: 'FalconX newsroom article',
    url: 'https://www.falconx.io/newsroom/the-growing-crypto-tradfi-crossover',
  },
];

function parseArgs(argv) {
  const out = {
    to: DEFAULT_TO,
    account: DEFAULT_ACCOUNT,
    dryRun: false,
    keepTemp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--to') out.to = argv[++i];
    else if (arg === '--account') out.account = argv[++i];
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--keep-temp') out.keepTemp = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function printHelp() {
  console.log(`send_openexa_briefing.js

Usage:
  node scripts/send_openexa_briefing.js [--to email] [--account gmail] [--dry-run] [--keep-temp]

Options:
  --to        Recipient email (default: ${DEFAULT_TO})
  --account   Gmail account for gog send (default: ${DEFAULT_ACCOUNT})
  --dry-run   Build briefing artifacts but do not send
  --keep-temp Keep temp files for inspection
`);
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirst(regex, text) {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

async function fetchSource(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 OpenEXA-Briefing/1.0' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const html = await res.text();
  const clean = textFromHtml(html).slice(0, MAX_SOURCE_CHARS);
  const title = extractFirst(/<title[^>]*>([^<]+)/i, html) || clean.slice(0, 160);
  const description = extractFirst(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i, html)
    || extractFirst(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i, html)
    || clean.slice(0, 240);
  const image = extractFirst(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i, html)
    || extractFirst(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i, html);
  return { title, description, clean, image };
}

async function downloadFile(url, outPath) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 OpenEXA-Briefing/1.0' },
  });
  if (!res.ok) throw new Error(`Failed download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

function todayParts() {
  const dt = new Date();
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dt);
  const short = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
  return { date, short };
}

function includesAny(text, needles) {
  const hay = text.toLowerCase();
  return needles.some((n) => hay.includes(n));
}

function pickTagline(data) {
  const fedText = `${data.fed.title} ${data.fed.description} ${data.cnbc.description}`;
  const cryptoText = `${data.coindesk.title} ${data.coindesk.description}`;
  if (includesAny(fedText, ['rate', 'fed', 'uncertainty', 'inflation'])) {
    return 'Fed posture and macro volatility tighten the execution regime';
  }
  if (includesAny(cryptoText, ['bitcoin', 'crypto', 'etf'])) {
    return 'Crypto volatility and ETF sensitivity stay center stage';
  }
  return 'Macro and market-structure risk remain the key operating theme';
}

function buildBody(date, data) {
  return [
    `TOP LINE`,
    `Today’s setup still looks better for disciplined spread capture than brute-force risk. The key theme is macro uncertainty bleeding into crypto, equities, and execution quality.`,
    ``,
    `1) FED / MACRO`,
    `${data.fed.title}. ${data.fed.description}`,
    `${data.cnbc.title}. ${data.cnbc.description}`,
    ``,
    `2) CRYPTO`,
    `${data.coindesk.title}. ${data.coindesk.description}`,
    `Operational read: watch BTC sensitivity, ETF-flow impulse, and whether basis/funding dislocations are durable enough to monetize after fees and slippage.`,
    ``,
    `3) VOL / STOCKS`,
    `Broad market tone looks headline-driven, which usually means the most useful stock signals are concentration-of-volatility clues rather than chaseable single-name moves. Focus on where volatility is clustering and where correlation breaks can create cleaner relative-value setups.`,
    ``,
    `4) COMPETITOR / INDUSTRY WATCH`,
    `${data.falconx.title}. ${data.falconx.description}`,
    `Strategic read: the TradFi/crypto crossover keeps validating the category. That raises the bar for OpenEXA on trust, reporting, and execution discipline.`,
    ``,
    `5) OPS WATCH`,
    `${data.ibkr.title}. ${data.ibkr.description}`,
    `Operator read: verify broker connectivity, stale-price handling, and reject/retry behavior before sizing into volatility.`,
    ``,
    `BOTTOM LINE`,
    `The most important story today is not a single ticker — it’s the combination of Fed-driven macro caution, crypto sensitivity, and execution-quality pressure. Good day for selective arbitrage. Bad day for sloppy throughput.`,
    ``,
    `Sources referenced: Federal Reserve, CNBC Markets, CoinDesk Markets, Interactive Brokers system status, FalconX newsroom.`,
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { date, short } = todayParts();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openexa-brief-'));

  try {
    const data = {};
    for (const source of SOURCES) {
      data[source.key] = await fetchSource(source.url);
    }

    const attachmentPaths = [];
    for (const key of ['fed', 'falconx']) {
      const imageUrl = data[key].image;
      if (!imageUrl) continue;
      try {
        const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
        const out = path.join(tmpDir, `${key}${ext}`);
        await downloadFile(imageUrl, out);
        attachmentPaths.push(out);
      } catch {
        // Skip attachment failures; sending the brief matters more.
      }
    }

    const subject = `OpenExa Daily Briefing ${short}: ${pickTagline(data)}`;
    const bodyPath = path.join(tmpDir, 'briefing.txt');
    fs.writeFileSync(bodyPath, `OpenExa Daily Briefing — ${date}\n\n${buildBody(date, data)}\n`);

    const sendArgs = [
      'gmail', 'send',
      '--account', args.account,
      '--to', args.to,
      '--subject', subject,
      '--body-file', bodyPath,
    ];

    for (const attach of attachmentPaths.slice(0, 2)) {
      sendArgs.push('--attach', attach);
    }

    if (args.dryRun) {
      console.log(JSON.stringify({
        ok: true,
        dryRun: true,
        to: args.to,
        account: args.account,
        subject,
        bodyPath,
        attachments: attachmentPaths,
      }, null, 2));
      return;
    }

    const sendOut = execFileSync('gog', sendArgs, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();

    console.log(JSON.stringify({
      ok: true,
      to: args.to,
      account: args.account,
      subject,
      attachments: attachmentPaths,
      gogOutput: sendOut,
    }, null, 2));
  } finally {
    if (!args.keepTemp) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
