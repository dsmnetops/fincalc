# FinCalc — Currency Converter & Compound Interest Calculator

A sleek, single-page personal finance tool for converting between **EUR**, **USD**, and **BRL** with live exchange rates, and calculating compound interest growth using real Brazilian benchmark rates (CDI & SELIC).

Built with vanilla HTML, CSS, and JavaScript — zero dependencies, no build step.

![Dark glassmorphism UI](https://img.shields.io/badge/UI-Dark%20Glassmorphism-6366f1) ![No Dependencies](https://img.shields.io/badge/Dependencies-None-10b981) ![Static Site](https://img.shields.io/badge/Hosting-Static-3b82f6)

---

## Screenshots

### Currency Converter

Convert between EUR, USD, and BRL with live rates fetched from multiple sources.

<p align="center">
  <img src="screenshots/currency-converter.png" alt="Currency Converter" width="700" />
</p>

### Compound Interest Calculator

Calculate investment growth with Brazilian CDI/SELIC rates, complete with multi-currency projections and an interactive chart.

<p align="center">
  <img src="screenshots/compound-interest.png" alt="Compound Interest Calculator" width="700" />
</p>

### Quick Reference Table

Instant conversion lookup for common EUR amounts across all three currencies.

<p align="center">
  <img src="screenshots/quick-reference.png" alt="Quick Reference Table" width="500" />
</p>

---

## Features

### 💱 Currency Converter

- **Tri-directional conversion** — type in any currency (EUR, USD, or BRL) and the other two update instantly.
- **Live exchange rates** with automatic API fallback:
  - Primary: [fawazahmed0 Currency API](https://github.com/fawazahmed0/exchange-api)
  - Secondary: [ExchangeRate-API](https://www.exchangerate-api.com/)
- **1-hour rate caching** via `localStorage` to minimise API calls.
- **Quick Reference table** showing conversions for common EUR amounts (€1 – €10,000).
- Link to [Revolut's converter](https://www.revolut.com/currency-converter/) for cross-referencing.

### 📈 Compound Interest Calculator
- **Currency Converter**: Convert between USD, EUR, and BRL using real-time data from Fawaz Ahmed's Exchange API.
- **Compound Interest Calculator**: Calculate future value of investments with monthly contributions.
  - **Live Exchange Rates**: Uses the current USD/EUR rates to project equivalent value in other currencies.
  - **Historical Mode**: Select a start date in the past, and it automatically fetches the real historical exchange rates for every month since that date.
  - **Real Interest Rate**: Option to deduct Brazilian inflation (IPCA) directly from the nominal rate.
- **Stock Market Module**:
  - **Live Tracker**: Monitor major indices (NASDAQ, S&P 500, Dow Jones) and specific stocks (e.g., ANET) with live prices via Yahoo Finance.
  - **Portfolio Simulator**: Input a stock symbol and number of shares to instantly see its total value in USD, EUR, and BRL.
  - **Strategy Comparison**: Compare the projected growth of holding a stock vs selling it and investing the cash in Brazilian fixed-income instruments like CDI or SELIC.
- **Live Brazilian Rates (BCB)**: Pulls the latest CDI, SELIC, and IPCA inflation rates directly from the Banco Central do Brasil API.
- **Bilingual Support**: Toggle between English and Portuguese instantly.

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/dsmnetops/fincalc.git
   cd fincalc
   ```

2. **Run Locally**:
   Since FinCalc is a static, dependency-free application, you just need a simple local web server to run it. If you have Python installed, you can start the server in your terminal:
   ```bash
   python3 -m http.server 8888
   ```
   Then open your browser and navigate to `http://localhost:8888`.

> **Note:** The app fetches live data from external APIs, so an internet connection is required for the first load. Cached rates will work offline for up to 1 hour.

---

## Usage

### Converting Currencies

1. Open the app — the **Currency Converter** tab is active by default.
2. Type an amount into **any** of the three currency fields (EUR, USD, or BRL).
3. The other two fields update automatically with the converted amounts.
4. Current exchange rates are displayed below the converter, along with the data sources.
5. Scroll down to see the **Quick Reference** table for common EUR conversion amounts.

### Calculating Compound Interest

1. Click the **Compound Interest** tab in the header.
2. Enter your **Initial Investment** (in R$) and an optional **Monthly Contribution**.
3. Set the **Annual Interest Rate**, or click the **CDI** or **SELIC** buttons to auto-fill the current Brazilian benchmark rate.
4. Choose the **Period** (years or months) and **Compounding Frequency** (daily, monthly, quarterly, semi-annually, or annually).
5. *(Optional)* Expand the **Currency Analysis** section to:
   - **Projection mode** — set expected annual BRL depreciation/appreciation vs USD and EUR.
   - **Historical mode** — select a start date to use real historical exchange rates.
6. Click **Calculate** to see:
   - A results summary showing Total Value, Total Invested, Interest Earned, and Effective Rate — all with USD and EUR equivalents.
   - A line chart comparing your total contributions vs portfolio balance over time.
   - A detailed monthly breakdown table.

---

## Project Structure

```
converter/
├── index.html          # Page structure and layout
├── style.css           # Dark glassmorphism design system
├── app.js              # All application logic (API calls, calculations, chart)
├── screenshots/        # README screenshots
│   ├── currency-converter.png
│   ├── compound-interest.png
│   └── quick-reference.png
└── README.md           # This file
```

No frameworks, no bundlers, no transpilers — just three source files.

---

## Data Sources

| Data              | Source                                                                                     | Endpoint                          |
| ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------- |
| Exchange rates    | [fawazahmed0 Currency API](https://github.com/fawazahmed0/exchange-api)                    | jsDelivr CDN                      |
| Exchange rates    | [ExchangeRate-API](https://www.exchangerate-api.com/)                                      | open.er-api.com                   |
| Historical rates  | [fawazahmed0 Currency API](https://github.com/fawazahmed0/exchange-api)                    | jsDelivr CDN (date-versioned)     |
| CDI rate          | [Banco Central do Brasil](https://www.bcb.gov.br/)                                        | SGS series 12                     |
| SELIC rate        | [Banco Central do Brasil](https://www.bcb.gov.br/)                                        | SGS series 11                     |

All rates are for **informational purposes only** and should not be used for financial transactions.

---

## How It Works

### Currency Converter

1. On page load, exchange rates are fetched from both APIs in parallel for all three base currencies.
2. Rates are cached in `localStorage` for 1 hour.
3. When you type in any currency input, the app converts to the other two using the best available rate (primary API preferred, secondary as fallback).

### Compound Interest Calculator

1. The calculator runs a **month-by-month simulation**, applying compound interest at the selected frequency.
2. When CDI or SELIC is selected, the daily rate from BCB is annualised using: `(1 + daily_rate)^252 - 1`.
3. **Projection mode** applies a constant annual FX drift to the spot rate.
4. **Historical mode** fetches real exchange rates for each month of the investment period and uses those for currency conversion.
5. The chart is rendered on a `<canvas>` element with device-pixel-ratio scaling for crisp rendering on Retina displays.

---

## License

This project is provided as-is for personal use.
