# ARKB ETF Creation/Redemption Arbitrage Simulation

Simulates the arbitrage mechanism that keeps **ARKB (ARK 21Shares Bitcoin ETF)** trading close to its Net Asset Value (NAV).

## Background

ARKB is a spot Bitcoin ETF. Each share represents ~0.00105 BTC (approximate; actual basket size changes as shares are issued/redeemed).

### The Arbitrage Mechanism

Authorized Participants (APs) can create or redeem **Creation Units** (5,000 shares per basket, per the ARKB prospectus) directly with the ETF issuer. This two-sided arbitrage keeps market price ≈ NAV:

| Scenario | AP Action | Effect |
|----------|-----------|--------|
| ARKB trades at **premium** (Market > NAV) | Buy BTC → deliver to custodian → receive ARKB shares → sell shares on exchange | Premium compresses |
| ARKB trades at **discount** (Market < NAV) | Buy ARKB shares → redeem with issuer → receive BTC → sell BTC | Discount compresses |

### Key Participants
- **ARK Investment Management / 21Shares** — ETF sponsor
- **Coinbase Custody** — Bitcoin custodian
- **Authorized Participants** — large broker-dealers (e.g., Jane Street, Virtu)
- **Market Makers** — provide intraday liquidity

## Simulation

The sim models:
1. Intraday BTC spot price (GBM with realistic vol)
2. ARKB intraday market price with random premium/discount noise
3. AP arbitrage triggers when spread exceeds transaction cost threshold
4. Creation/redemption flows and their impact on NAV convergence

## Files

- `sim.py` — Main simulation engine
- `config.json` — Configurable parameters
- `run.sh` — Quick run script
- `results/` — Output CSV + chart PNG after running

## Usage

```bash
python3 sim.py                    # Run with defaults
python3 sim.py --days 5           # 5-day simulation
python3 sim.py --vol 0.04         # Custom BTC daily vol
python3 sim.py --ap-threshold 0.15  # AP triggers at 15bps spread
```
