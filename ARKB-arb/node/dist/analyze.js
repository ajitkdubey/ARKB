#!/usr/bin/env node
/**
 * ARKB ETF Creation/Redemption Arbitrage — Phase 1: Historical Analysis
 *
 * Fetches historical ARKB + BTC data, computes premium/discount,
 * identifies arb opportunities, and outputs analysis + CSV.
 *
 * Data sources:
 *   - Yahoo Finance (yahoo-finance2) for ARKB & BTC-USD historical prices
 *   - ARK 21Shares CSV for current BTC-per-share ratio
 *     (falls back to price-derived estimate if unavailable)
 *
 * ARKB facts:
 *   - Sponsor:      ARK Investment Management / 21Shares
 *   - Custodian:    Coinbase Custody
 *   - Ticker:       ARKB
 *   - Launch:       January 11, 2024 (alongside IBIT, FBTC, etc.)
 *   - Mgmt fee:     0.21% / yr
 *   - Creation unit: 5,000 shares
 *   - BTC per share: ~0.000303 (derived: $25.72 ARKB / $85k BTC, Apr 2026)
 *
 * Usage:
 *   node analyze.js
 */

const fs = require('fs');
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { createObjectCsvWriter } = require('csv-writer');
const { fetchArkHoldings, totalCostBps, fmt, fmtUsd } = require('./lib/utils');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

// ─── Data Fetching ──────────────────────────────────────────────────────────

async function fetchHistorical(ticker, startDate) {
  console.log(`Fetching ${ticker} from ${startDate}...`);
  const result = await yahooFinance.chart(ticker, {
    period1: startDate,
    interval: '1d',
  });
  const quotes = result.quotes || [];
  console.log(`  → ${quotes.length} data points`);
  return quotes;
}

async function getArkBtcPerShare() {
  try {
    console.log('Fetching ARK 21Shares ARKB holdings...');
    const holdings = await fetchArkHoldings(config);
    console.log(`  BTC held: ${fmt(holdings.btcQuantity, 4)}`);
    console.log(`  Market value: ${fmtUsd(holdings.marketValue)}`);
    return holdings;
  } catch (e) {
    console.warn(`  Warning: Could not fetch ARK holdings: ${e.message}`);
    return null;
  }
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function buildAnalysis(arkbQuotes, btcQuotes, btcPerShareRatio) {
  const btcByDate = new Map();
  for (const q of btcQuotes) {
    if (!q.date || q.close == null) continue;
    const key = q.date.toISOString().slice(0, 10);
    btcByDate.set(key, q.close);
  }

  const rows = [];
  for (const q of arkbQuotes) {
    if (!q.date || q.close == null || q.volume == null) continue;
    const dateKey = q.date.toISOString().slice(0, 10);
    const btcClose = btcByDate.get(dateKey);
    if (btcClose == null) continue;

    const navEstimate = btcClose * btcPerShareRatio;
    const premDiscBps = ((q.close - navEstimate) / navEstimate) * 10000;
    const costBps = totalCostBps(config, q.close);
    const triggerBps = costBps + config.signals.minSpreadAfterCostsBps;

    const isCreate = premDiscBps > triggerBps;
    const isRedeem = premDiscBps < -triggerBps;
    const spreadCapturedBps = (isCreate || isRedeem) ? Math.abs(premDiscBps) - costBps : 0;
    const pnlPerTrade = (spreadCapturedBps / 10000) * config.etf.creationUnitShares * q.close;

    rows.push({
      date: dateKey,
      arkbClose: q.close,
      arkbVolume: q.volume,
      btcClose,
      navEstimate,
      premDiscBps,
      costBps,
      triggerBps,
      isCreate,
      isRedeem,
      spreadCapturedBps,
      pnlPerTrade,
    });
  }

  return rows;
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function printSummary(rows) {
  const cu = config.etf.creationUnitShares;
  const premDiscValues = rows.map(r => r.premDiscBps);
  const mean = premDiscValues.reduce((a, b) => a + b, 0) / premDiscValues.length;
  const sorted = [...premDiscValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const stdDev = Math.sqrt(premDiscValues.reduce((s, v) => s + (v - mean) ** 2, 0) / premDiscValues.length);
  const min = Math.min(...premDiscValues);
  const max = Math.max(...premDiscValues);

  const creates = rows.filter(r => r.isCreate);
  const redeems = rows.filter(r => r.isRedeem);
  const trades  = rows.filter(r => r.isCreate || r.isRedeem);
  const totalDays = rows.length;
  const years = totalDays / 252;

  const avgPrice = rows.reduce((s, r) => s + r.arkbClose, 0) / rows.length;
  const capital  = cu * avgPrice;

  const sep = '='.repeat(60);
  console.log(`\n${sep}`);
  console.log(' ARKB ETF ARBITRAGE — HISTORICAL ANALYSIS');
  console.log(' ARK 21Shares Bitcoin ETF | Sponsor: ARK / 21Shares');
  console.log(' Custodian: Coinbase Custody | Creation Unit: 5,000 shares');
  console.log(sep);
  console.log(` Period          : ${rows[0].date} → ${rows[rows.length - 1].date}`);
  console.log(` Trading days    : ${totalDays}`);
  console.log(` Years           : ${fmt(years)}`);
  console.log('');
  console.log(' Premium/Discount Stats (bps):');
  console.log(`   Mean           : ${fmt(mean, 2).padStart(10)}`);
  console.log(`   Median         : ${fmt(median, 2).padStart(10)}`);
  console.log(`   Std Dev        : ${fmt(stdDev, 2).padStart(10)}`);
  console.log(`   Min            : ${fmt(min, 2).padStart(10)}`);
  console.log(`   Max            : ${fmt(max, 2).padStart(10)}`);
  console.log('');
  console.log(' Cost Breakdown (bps):');
  if (rows.length > 0) {
    const c = config.costs;
    const feeBps = (c.creationRedemptionFeeUsd / (cu * avgPrice)) * 10000;
    const commBps = (c.etfCommissionPerShare / avgPrice) * 10000;
    console.log(`   Create/Redeem fee : ${fmt(feeBps, 2).padStart(8)}  ($${c.creationRedemptionFeeUsd} flat)`);
    console.log(`   ETF commission    : ${fmt(commBps, 2).padStart(8)}  ($${c.etfCommissionPerShare}/share)`);
    console.log(`   BTC execution     : ${fmt(c.btcExecutionBps, 2).padStart(8)}`);
    console.log(`   Market impact (×2): ${fmt(c.marketImpactBps * 2, 2).padStart(8)}`);
    console.log(`   BTC spot spread   : ${fmt(c.btcSpotSpreadBps, 2).padStart(8)}`);
    console.log(`   TOTAL             : ${fmt(rows[0].costBps, 2).padStart(8)}`);
  }
  console.log('');
  console.log(' Actionable Opportunities:');
  console.log(`   Create signals : ${String(creates.length).padStart(6)}  (${fmt(creates.length / totalDays * 100, 1)}% of days)`);
  console.log(`   Redeem signals : ${String(redeems.length).padStart(6)}  (${fmt(redeems.length / totalDays * 100, 1)}% of days)`);
  console.log(`   Total trades   : ${String(trades.length).padStart(6)}  (${fmt(trades.length / totalDays * 100, 1)}% of days)`);
  console.log('');

  if (trades.length > 0) {
    const avgPnl    = trades.reduce((s, t) => s + t.pnlPerTrade, 0) / trades.length;
    const totalPnl  = trades.reduce((s, t) => s + t.pnlPerTrade, 0);
    const annualPnl = totalPnl / years;
    const annualReturn = (annualPnl / capital) * 100;
    const avgSpread = trades.reduce((s, t) => s + t.spreadCapturedBps, 0) / trades.length;

    console.log(` P&L Analysis (creation unit = ${cu.toLocaleString()} shares):`);
    console.log(`   Capital required : ${fmtUsd(capital).padStart(18)}`);
    console.log(`   Avg spread capt. : ${fmt(avgSpread, 2).padStart(10)} bps`);
    console.log(`   Avg P&L / trade  : ${fmtUsd(avgPnl).padStart(18)}`);
    console.log(`   Total P&L        : ${fmtUsd(totalPnl).padStart(18)}`);
    console.log(`   Annualized P&L   : ${fmtUsd(annualPnl).padStart(18)}`);
    console.log(`   Annualized Return: ${fmt(annualReturn, 2).padStart(10)}%`);
  } else {
    console.log(' No actionable opportunities at current thresholds.');
    console.log(' Try lowering signals.minSpreadAfterCostsBps in config.json');
  }
  console.log(sep);
}

// ─── CSV Export ─────────────────────────────────────────────────────────────

async function exportCsv(rows, filepath) {
  const writer = createObjectCsvWriter({
    path: filepath,
    header: [
      { id: 'date',              title: 'Date' },
      { id: 'arkbClose',         title: 'ARKB Close' },
      { id: 'arkbVolume',        title: 'ARKB Volume' },
      { id: 'btcClose',          title: 'BTC Close' },
      { id: 'navEstimate',       title: 'NAV Estimate' },
      { id: 'premDiscBps',       title: 'Premium/Discount (bps)' },
      { id: 'costBps',           title: 'Cost (bps)' },
      { id: 'isCreate',          title: 'Create Signal' },
      { id: 'isRedeem',          title: 'Redeem Signal' },
      { id: 'spreadCapturedBps', title: 'Spread Captured (bps)' },
      { id: 'pnlPerTrade',       title: 'P&L Per Trade (USD)' },
    ],
  });
  await writer.writeRecords(rows.map(r => ({
    ...r,
    arkbClose:         r.arkbClose.toFixed(4),
    btcClose:          r.btcClose.toFixed(2),
    navEstimate:       r.navEstimate.toFixed(4),
    premDiscBps:       r.premDiscBps.toFixed(2),
    costBps:           r.costBps.toFixed(2),
    spreadCapturedBps: r.spreadCapturedBps.toFixed(2),
    pnlPerTrade:       r.pnlPerTrade.toFixed(2),
  })));
  console.log(`\nExported analysis to ${filepath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ARKB Arbitrage — Phase 1: Historical Analysis          ║');
  console.log('║  Data: Yahoo Finance + ARK 21Shares Holdings CSV        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // 1. Try to fetch ARK 21Shares holdings for accurate BTC-per-share
  const arkHoldings = await getArkBtcPerShare();

  // 2. Fetch historical price data
  const startDate = config.analysis.startDate;
  const [arkbQuotes, btcQuotes] = await Promise.all([
    fetchHistorical(config.etf.ticker, startDate),
    fetchHistorical(config.bitcoin.ticker, startDate),
  ]);

  if (arkbQuotes.length === 0) {
    console.error('No ARKB data returned. Check ticker and date range.');
    process.exit(1);
  }

  // 3. Determine BTC-per-share ratio
  let btcPerShare;
  if (arkHoldings && arkHoldings.btcQuantity > 0) {
    // We'd need shares outstanding too — use a known recent figure
    // ARKB ~75M shares outstanding as of early 2025, holding ~78,750 BTC
    // btcPerShare ≈ 25.72 / 85000 = 0.000303 (Apr 2026)
    const sharesOutstanding = 75_000_000;
    btcPerShare = arkHoldings.btcQuantity / sharesOutstanding;
    console.log(`\nBTC per share (ARK holdings): ${btcPerShare.toFixed(8)}`);
  } else {
    // Fallback: use config default or derive from first day
    btcPerShare = config.etf.btcPerShare || 0.000303;
    console.log(`\nBTC per share (config default): ${btcPerShare.toFixed(8)}`);
  }

  // 4. Build analysis
  const rows = buildAnalysis(arkbQuotes, btcQuotes, btcPerShare);
  if (rows.length === 0) {
    console.error('No overlapping data. Check date range and tickers.');
    process.exit(1);
  }

  // 5. Print summary
  printSummary(rows);

  // 6. Export CSV
  const csvPath = path.join(__dirname, 'analysis.csv');
  await exportCsv(rows, csvPath);

  // 7. Monthly breakdown
  console.log('\n Monthly Breakdown:');
  console.log(' ─────────────────────────────────────────────────────────────');
  console.log(' Month       | Days | Creates | Redeems | Total P&L    | Avg Prem');
  console.log(' ─────────────────────────────────────────────────────────────');

  const byMonth = new Map();
  for (const r of rows) {
    const month = r.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(r);
  }

  for (const [month, monthRows] of byMonth) {
    const creates = monthRows.filter(r => r.isCreate).length;
    const redeems = monthRows.filter(r => r.isRedeem).length;
    const pnl = monthRows.reduce((s, r) => s + r.pnlPerTrade, 0);
    const avgPrem = monthRows.reduce((s, r) => s + r.premDiscBps, 0) / monthRows.length;
    console.log(
      ` ${month}    |  ${String(monthRows.length).padStart(3)} |     ${String(creates).padStart(3)} |     ${String(redeems).padStart(3)} | ${fmtUsd(pnl).padStart(13)} | ${fmt(avgPrem, 2).padStart(7)} bps`
    );
  }
  console.log(' ─────────────────────────────────────────────────────────────');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
