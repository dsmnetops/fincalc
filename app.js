/* ===================================================================
   FinCalc — Currency Converter & Compound Interest Calculator
   =================================================================== */

(function () {
  'use strict';

  // ──────────────────────── CONFIG ────────────────────────
  const CURRENCIES = {
    eur: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
    usd: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
    brl: { symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷' },
  };

  const CACHE_KEY = 'fincalc_rates_cache';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour

  // API endpoints
  const API_PRIMARY = (cur) =>
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${cur}.json`;
  const API_SECONDARY = (cur) =>
    `https://open.er-api.com/v6/latest/${cur.toUpperCase()}`;

  const BCB_CDI = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json';
  const BCB_SELIC = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json';

  // ──────────────────────── STATE ────────────────────────
  let ratesPrimary = {};   // { eur: { usd: ..., brl: ... }, ... }
  let ratesSecondary = {};
  let cdiRate = null;
  let selicRate = null;

  // ──────────────────────── DOM REFS ────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const amountEur = $('#amount-eur');
  const amountUsd = $('#amount-usd');
  const amountBrl = $('#amount-brl');
  const rateLoading = $('#rate-loading');
  const rateInfo = $('#rate-info');
  const rateUpdated = $('#rate-updated');
  const rateTimestamp = $('#rate-timestamp');

  // Interest
  const ciPrincipal = $('#ci-principal');
  const ciMonthly = $('#ci-monthly');
  const ciRate = $('#ci-rate');
  const ciPeriod = $('#ci-period');
  const ciPeriodUnit = $('#ci-period-unit');
  const ciCompound = $('#ci-compound');
  const ciCalculate = $('#ci-calculate');

  // Currency analysis
  const ciFxUsd = $('#ci-fx-usd');
  const ciFxEur = $('#ci-fx-eur');
  const projectionToggle = $('#projection-toggle');
  const projectionPanel = $('#projection-panel');
  const toggleChevron = $('#toggle-chevron');
  const ciStartDate = $('#ci-start-date');
  const historicalStatus = $('#historical-status');
  const historicalStatusText = $('#historical-status-text');

  let currentMode = 'projection'; // 'projection' or 'historical'
  const historicalRatesCache = {}; // keyed by 'YYYY-MM-DD'

  // ──────────────────────── NAV ────────────────────────
  $$('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;
      $$('.nav-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      $$('.section').forEach((s) => s.classList.remove('active'));
      $(`#${target}`).classList.add('active');
      // Re-draw chart when interest section becomes visible
      if (target === 'interest') {
        requestAnimationFrame(() => calculateCompoundInterest());
      }
    });
  });

  // ──────────────────────── CURRENCY CONVERTER ────────────────────────

  // Fetch rates from primary API (fawazahmed0)
  async function fetchPrimaryRates(base) {
    try {
      const res = await fetch(API_PRIMARY(base));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data[base] || {};
    } catch (err) {
      console.warn('Primary API error:', err);
      return null;
    }
  }

  // Fetch rates from secondary API (ExchangeRate-API)
  async function fetchSecondaryRates(base) {
    try {
      const res = await fetch(API_SECONDARY(base));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.rates || {};
    } catch (err) {
      console.warn('Secondary API error:', err);
      return null;
    }
  }

  // Load & cache all rates
  async function loadRates() {
    // Check cache first
    const cached = getCachedRates();
    if (cached) {
      ratesPrimary = cached.primary;
      ratesSecondary = cached.secondary;
      showRates();
      convertFrom('eur');
      return;
    }

    rateLoading.classList.remove('hidden');
    rateInfo.classList.add('hidden');
    rateUpdated.classList.add('hidden');

    const bases = Object.keys(CURRENCIES);
    const [primaryResults, secondaryResults] = await Promise.all([
      Promise.all(bases.map((b) => fetchPrimaryRates(b))),
      Promise.all(bases.map((b) => fetchSecondaryRates(b))),
    ]);

    bases.forEach((base, i) => {
      if (primaryResults[i]) ratesPrimary[base] = primaryResults[i];
      if (secondaryResults[i]) {
        // Normalise keys to lowercase
        const normalised = {};
        for (const [k, v] of Object.entries(secondaryResults[i])) {
          normalised[k.toLowerCase()] = v;
        }
        ratesSecondary[base] = normalised;
      }
    });

    // Cache
    setCachedRates({ primary: ratesPrimary, secondary: ratesSecondary, ts: Date.now() });

    showRates();
    convertFrom('eur');
  }

  function getCachedRates() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function setCachedRates(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  function getRate(from, to) {
    return ratesPrimary[from]?.[to] ?? ratesSecondary[from]?.[to];
  }

  function showRates() {
    rateLoading.classList.add('hidden');
    rateInfo.classList.remove('hidden');
    rateUpdated.classList.remove('hidden');

    const pairs = [
      { from: 'eur', to: 'usd', el: '#rate-eur-usd' },
      { from: 'eur', to: 'brl', el: '#rate-eur-brl' },
      { from: 'usd', to: 'brl', el: '#rate-usd-brl' },
    ];

    pairs.forEach(({ from, to, el }) => {
      const rate = getRate(from, to);
      $(el).textContent = rate != null ? formatRate(rate) : '—';
    });

    rateTimestamp.textContent = new Date().toLocaleString();
    updateQuickTable();
  }

  function formatRate(v) {
    if (v >= 100) return v.toFixed(2);
    if (v >= 1) return v.toFixed(4);
    return v.toFixed(6);
  }

  // Convert from a given source currency, updating the other two inputs
  function convertFrom(source) {
    const inputs = { eur: amountEur, usd: amountUsd, brl: amountBrl };
    const amount = parseFloat(inputs[source].value) || 0;
    const others = Object.keys(CURRENCIES).filter((c) => c !== source);

    others.forEach((target) => {
      const rate = getRate(source, target);
      if (rate != null) {
        inputs[target].value = (amount * rate).toFixed(2);
      } else {
        inputs[target].value = '';
      }
    });
  }

  function updateQuickTable() {
    const eurUsd = getRate('eur', 'usd');
    const eurBrl = getRate('eur', 'brl');

    const amounts = [1, 10, 50, 100, 500, 1000, 5000, 10000];
    const tbody = $('#quick-table-body');
    tbody.innerHTML = amounts
      .map((a) => {
        const usd = eurUsd != null ? (a * eurUsd).toFixed(2) : '—';
        const brl = eurBrl != null ? (a * eurBrl).toFixed(2) : '—';
        return `<tr>
          <td>€ ${a.toLocaleString()}</td>
          <td>$ ${usd}</td>
          <td>R$ ${brl}</td>
        </tr>`;
      })
      .join('');
  }

  // Bind input events — each input converts from its own currency
  let isUpdating = false;
  function bindCurrencyInput(inputEl, currency) {
    inputEl.addEventListener('input', () => {
      if (isUpdating) return;
      isUpdating = true;
      convertFrom(currency);
      isUpdating = false;
    });
  }

  bindCurrencyInput(amountEur, 'eur');
  bindCurrencyInput(amountUsd, 'usd');
  bindCurrencyInput(amountBrl, 'brl');

  // ──────────────────────── CDI / SELIC ────────────────────────

  async function loadBrazilianRates() {
    try {
      const [cdiRes, selicRes] = await Promise.all([fetch(BCB_CDI), fetch(BCB_SELIC)]);

      if (cdiRes.ok) {
        const cdiData = await cdiRes.json();
        if (cdiData.length) {
          const dailyVal = parseFloat(cdiData[0].valor);
          const annualised = (Math.pow(1 + dailyVal / 100, 252) - 1) * 100;
          cdiRate = { value: dailyVal, annualised, date: cdiData[0].data };
          $('#btn-cdi-rate').textContent = `${annualised.toFixed(1)}%`;
        }
      }

      if (selicRes.ok) {
        const selicData = await selicRes.json();
        if (selicData.length) {
          const dailyVal = parseFloat(selicData[0].valor);
          const annualised = (Math.pow(1 + dailyVal / 100, 252) - 1) * 100;
          selicRate = { value: dailyVal, annualised, date: selicData[0].data };
          $('#btn-selic-rate').textContent = `${annualised.toFixed(1)}%`;
        }
      }
    } catch (err) {
      console.warn('BCB API error:', err);
    }
  }

  $('#btn-cdi').addEventListener('click', () => {
    if (!cdiRate) return;
    ciRate.value = cdiRate.annualised.toFixed(2);
    showRateAutoInfo('CDI', cdiRate.annualised.toFixed(2), cdiRate.date);
  });

  $('#btn-selic').addEventListener('click', () => {
    if (!selicRate) return;
    ciRate.value = selicRate.annualised.toFixed(2);
    showRateAutoInfo('SELIC', selicRate.annualised.toFixed(2), selicRate.date);
  });

  function showRateAutoInfo(name, value, date) {
    const info = $('#rate-auto-info');
    info.classList.remove('hidden');
    $('#rate-auto-name').textContent = name;
    $('#rate-auto-value').textContent = value;
    $('#rate-auto-date').textContent = date;
  }

  // ──────────────────────── CURRENCY ANALYSIS TOGGLE ────────────────────────

  projectionToggle.addEventListener('click', () => {
    const isHidden = projectionPanel.classList.toggle('hidden');
    toggleChevron.textContent = isHidden ? '▸' : '▾';
    projectionToggle.classList.toggle('open', !isHidden);
  });

  // Mode toggle (Projection / Historical)
  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      $$('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $('#mode-projection').classList.toggle('hidden', currentMode !== 'projection');
      $('#mode-historical').classList.toggle('hidden', currentMode !== 'historical');
    });
  });

  // ──────────────────────── HISTORICAL RATES ────────────────────────

  async function fetchHistoricalRate(dateStr) {
    // Check memory cache
    if (historicalRatesCache[dateStr]) return historicalRatesCache[dateStr];

    // Check localStorage cache
    const cacheKey = `fincalc_hist_${dateStr}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        historicalRatesCache[dateStr] = parsed;
        return parsed;
      }
    } catch { /* ignore */ }

    // Fetch from API
    const urls = [
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/brl.json`,
      `https://${dateStr}.currency-api.pages.dev/v1/currencies/brl.json`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const rates = data.brl || {};
        const result = {
          brlToUsd: rates.usd ?? null,
          brlToEur: rates.eur ?? null,
          date: dateStr,
        };
        // Cache it
        historicalRatesCache[dateStr] = result;
        try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* ignore */ }
        return result;
      } catch { continue; }
    }

    return { brlToUsd: null, brlToEur: null, date: dateStr };
  }

  async function fetchHistoricalRatesForPeriod(startDateStr, totalMonths) {
    const [startYear, startMonth] = startDateStr.split('-').map(Number);
    const dates = [];

    for (let m = 0; m <= totalMonths; m++) {
      const d = new Date(startYear, startMonth - 1 + m, 1);
      // Don't fetch future dates
      if (d > new Date()) break;
      dates.push(d.toISOString().slice(0, 10));
    }

    historicalStatus.classList.remove('hidden');
    historicalStatusText.textContent = `Fetching rates for ${dates.length} months…`;

    // Fetch in batches of 6 to avoid overwhelming the API
    const results = [];
    const batchSize = 6;
    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(fetchHistoricalRate));
      results.push(...batchResults);
      historicalStatusText.textContent = `Fetched ${results.length} of ${dates.length} months…`;
    }

    historicalStatus.classList.add('hidden');
    return results;
  }

  // ──────────────────────── COMPOUND INTEREST ────────────────────────

  async function calculateCompoundInterest() {
    const P = parseFloat(ciPrincipal.value) || 0;
    const PMT = parseFloat(ciMonthly.value) || 0;
    const annualRate = parseFloat(ciRate.value) || 0;
    const r = annualRate / 100;
    const n = parseInt(ciCompound.value, 10);
    let totalMonths;

    if (ciPeriodUnit.value === 'years') {
      totalMonths = (parseInt(ciPeriod.value, 10) || 0) * 12;
    } else {
      totalMonths = parseInt(ciPeriod.value, 10) || 0;
    }

    // ── Determine FX rates mode ──
    const isHistorical = currentMode === 'historical';
    let historicalRates = null;
    let baseBrlToUsd = null;
    let baseBrlToEur = null;
    let hasRates = false;

    if (isHistorical) {
      // Fetch real historical rates
      const startDate = ciStartDate.value; // 'YYYY-MM'
      if (startDate) {
        historicalRates = await fetchHistoricalRatesForPeriod(startDate, totalMonths);
        hasRates = historicalRates.length > 0 && historicalRates[0].brlToUsd != null;
        if (hasRates) {
          baseBrlToUsd = historicalRates[0].brlToUsd;
          baseBrlToEur = historicalRates[0].brlToEur;
        }
      }
    } else {
      // Projection mode — use today's spot rate
      baseBrlToUsd = getRate('brl', 'usd');
      baseBrlToEur = getRate('brl', 'eur');
      hasRates = baseBrlToUsd != null && baseBrlToEur != null;
    }

    const fxChangeUsd = (parseFloat(ciFxUsd.value) || 0) / 100;
    const fxChangeEur = (parseFloat(ciFxEur.value) || 0) / 100;

    // Month-by-month simulation — always record every month
    let balance = P;
    let totalContributions = P;
    const monthlyData = [];

    // Record initial state (month 0)
    {
      let usdRate0 = null;
      let eurRate0 = null;
      if (isHistorical && historicalRates && historicalRates.length > 0) {
        usdRate0 = historicalRates[0].brlToUsd;
        eurRate0 = historicalRates[0].brlToEur;
      } else if (hasRates) {
        usdRate0 = baseBrlToUsd;
        eurRate0 = baseBrlToEur;
      }
      monthlyData.push({
        month: 0,
        period: 'M0',
        contributions: P,
        balance: P,
        projectedUsdRate: usdRate0,
        projectedEurRate: eurRate0,
      });
    }

    for (let month = 1; month <= totalMonths; month++) {
      balance += PMT;
      totalContributions += PMT;

      // Apply compounding
      if (n >= 12) {
        const compoundsThisMonth = n / 12;
        for (let c = 0; c < compoundsThisMonth; c++) {
          balance *= 1 + r / n;
        }
      } else {
        balance *= Math.pow(1 + r / n, n / 12);
      }

      // Determine FX rate for this month
      let usdRate = null;
      let eurRate = null;

      if (isHistorical && historicalRates) {
        const rateEntry = historicalRates[Math.min(month, historicalRates.length - 1)];
        if (rateEntry) {
          usdRate = rateEntry.brlToUsd;
          eurRate = rateEntry.brlToEur;
        }
      } else if (hasRates) {
        const periodFraction = month / 12;
        usdRate = baseBrlToUsd * Math.pow(1 + fxChangeUsd, periodFraction);
        eurRate = baseBrlToEur * Math.pow(1 + fxChangeEur, periodFraction);
      }

      monthlyData.push({
        month: month,
        period: `M${month}`,
        contributions: totalContributions,
        balance: balance,
        projectedUsdRate: usdRate,
        projectedEurRate: eurRate,
      });
    }

    const totalInterest = balance - totalContributions;
    const effectiveRate = totalContributions > 0
      ? ((balance / totalContributions - 1) * 100)
      : 0;

    // Final period's rates (for summary cards)
    const finalData = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : null;
    const finalUsdRate = finalData?.projectedUsdRate;
    const finalEurRate = finalData?.projectedEurRate;

    // Update summary — BRL
    $('#ci-total').textContent = formatBRL(balance);
    $('#ci-invested').textContent = formatBRL(totalContributions);
    $('#ci-earnings').textContent = formatBRL(totalInterest);
    $('#ci-effective').textContent = effectiveRate.toFixed(2) + '%';

    // Update summary — USD & EUR equivalents
    if (hasRates && finalUsdRate != null && finalEurRate != null) {
      $('#ci-total-usd').innerHTML = `<span class="cur-flag">🇺🇸</span> ${formatUSD(balance * finalUsdRate)}`;
      $('#ci-total-eur').innerHTML = `<span class="cur-flag">🇪🇺</span> ${formatEUR(balance * finalEurRate)}`;
      $('#ci-invested-usd').innerHTML = `<span class="cur-flag">🇺🇸</span> ${formatUSD(totalContributions * baseBrlToUsd)}`;
      $('#ci-invested-eur').innerHTML = `<span class="cur-flag">🇪🇺</span> ${formatEUR(totalContributions * baseBrlToEur)}`;
      const earningsUsd = balance * finalUsdRate - totalContributions * baseBrlToUsd;
      const earningsEur = balance * finalEurRate - totalContributions * baseBrlToEur;
      $('#ci-earnings-usd').innerHTML = `<span class="cur-flag">🇺🇸</span> ${formatUSD(earningsUsd)}`;
      $('#ci-earnings-eur').innerHTML = `<span class="cur-flag">🇪🇺</span> ${formatEUR(earningsEur)}`;
      const noteText = isHistorical
        ? 'Using real historical exchange rates from fawazahmed0 API.'
        : 'Currency conversions use live exchange rates from the Currency Converter tab.';
      $('#ci-rates-note').querySelector('span').textContent = noteText;
      $('#ci-rates-note').classList.remove('hidden');
    } else {
      $('#ci-total-usd').innerHTML = '<span class="cur-flag">🇺🇸</span> —';
      $('#ci-total-eur').innerHTML = '<span class="cur-flag">🇪🇺</span> —';
      $('#ci-invested-usd').innerHTML = '<span class="cur-flag">🇺🇸</span> —';
      $('#ci-invested-eur').innerHTML = '<span class="cur-flag">🇪🇺</span> —';
      $('#ci-earnings-usd').innerHTML = '<span class="cur-flag">🇺🇸</span> —';
      $('#ci-earnings-eur').innerHTML = '<span class="cur-flag">🇪🇺</span> —';
      $('#ci-rates-note').classList.add('hidden');
    }

    // Build breakdown table (skip month 0)
    buildBreakdownTable(monthlyData.slice(1));

    // Draw chart (all points including month 0)
    drawChart(monthlyData);
  }

  function formatBRL(v) {
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatUSD(v) {
    return '$ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatEUR(v) {
    return '€ ' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildBreakdownTable(data) {
    const tbody = $('#ci-breakdown-body');
    let cumulativeInterest = 0;
    tbody.innerHTML = data
      .map((row) => {
        const interestThisPeriod = row.balance - row.contributions - cumulativeInterest;
        cumulativeInterest = row.balance - row.contributions;
        const usdBal = row.projectedUsdRate != null ? formatUSD(row.balance * row.projectedUsdRate) : '—';
        const eurBal = row.projectedEurRate != null ? formatEUR(row.balance * row.projectedEurRate) : '—';
        return `<tr>
          <td>${row.period}</td>
          <td>${formatBRL(row.contributions)}</td>
          <td>+${formatBRL(interestThisPeriod > 0 ? interestThisPeriod : 0)}</td>
          <td>${formatBRL(row.balance)}</td>
          <td class="col-usd">${usdBal}</td>
          <td class="col-eur">${eurBal}</td>
        </tr>`;
      })
      .join('');
  }

  // ──────────────────────── LINE CHART ────────────────────────

  function drawChart(data) {
    const canvas = $('#ci-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    const H = 300;
    canvas.width = rect.width * dpr;
    canvas.height = H * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const pad = { top: 24, right: 24, bottom: 48, left: 80 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    if (data.length < 2) return;

    const maxBalance = Math.max(...data.map((d) => d.balance));
    const maxContrib = Math.max(...data.map((d) => d.contributions));
    const maxVal = Math.max(maxBalance, maxContrib) * 1.1;

    // Helper: map data index to x coordinate
    const xAt = (i) => pad.left + (i / (data.length - 1)) * chartW;
    // Helper: map value to y coordinate
    const yAt = (v) => pad.top + chartH - (v / maxVal) * chartH;

    // ── Grid lines & Y-axis labels ──
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      const val = maxVal - (maxVal / gridLines) * i;
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(abbreviateNumber(val), pad.left - 10, y + 4);
    }

    // ── X-axis labels (smart thinning) ──
    const totalPts = data.length;
    let labelStep;
    if (totalPts <= 13) labelStep = 1;
    else if (totalPts <= 37) labelStep = 3;
    else if (totalPts <= 61) labelStep = 6;
    else labelStep = 12;

    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < totalPts; i++) {
      if (i === 0 || i === totalPts - 1 || i % labelStep === 0) {
        const x = xAt(i);
        ctx.fillText(data[i].period, x, H - pad.bottom + 18);
        // Small tick mark
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
        ctx.beginPath();
        ctx.moveTo(x, pad.top + chartH);
        ctx.lineTo(x, pad.top + chartH + 4);
        ctx.stroke();
      }
    }

    // ── Fill area under balance line ──
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(data[0].balance));
    for (let i = 1; i < totalPts; i++) {
      ctx.lineTo(xAt(i), yAt(data[i].balance));
    }
    ctx.lineTo(xAt(totalPts - 1), pad.top + chartH);
    ctx.lineTo(xAt(0), pad.top + chartH);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    fillGrad.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    fillGrad.addColorStop(1, 'rgba(16, 185, 129, 0.01)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // ── Fill area under contributions line ──
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(data[0].contributions));
    for (let i = 1; i < totalPts; i++) {
      ctx.lineTo(xAt(i), yAt(data[i].contributions));
    }
    ctx.lineTo(xAt(totalPts - 1), pad.top + chartH);
    ctx.lineTo(xAt(0), pad.top + chartH);
    ctx.closePath();
    const fillGrad2 = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    fillGrad2.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
    fillGrad2.addColorStop(1, 'rgba(99, 102, 241, 0.01)');
    ctx.fillStyle = fillGrad2;
    ctx.fill();

    // ── Draw contribution line ──
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(data[0].contributions));
    for (let i = 1; i < totalPts; i++) {
      ctx.lineTo(xAt(i), yAt(data[i].contributions));
    }
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // ── Draw balance line ──
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(data[0].balance));
    for (let i = 1; i < totalPts; i++) {
      ctx.lineTo(xAt(i), yAt(data[i].balance));
    }
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ── Dots at each data point (adaptive: show all when ≤60, skip for large sets) ──
    const dotStep = totalPts <= 60 ? 1 : Math.max(1, Math.floor(totalPts / 60));
    const dotRadius = totalPts <= 24 ? 4 : totalPts <= 60 ? 3 : 2.5;

    for (let i = 0; i < totalPts; i++) {
      if (i % dotStep !== 0 && i !== totalPts - 1) continue;
      const xp = xAt(i);

      // Contribution dot
      ctx.beginPath();
      ctx.arc(xp, yAt(data[i].contributions), dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#4338ca';
      ctx.fill();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Balance dot
      ctx.beginPath();
      ctx.arc(xp, yAt(data[i].balance), dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#059669';
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ── Legend ──
    ctx.font = '11px Inter, sans-serif';
    const legendY = H - 8;
    // Invested
    ctx.beginPath();
    ctx.moveTo(W / 2 - 110, legendY - 3);
    ctx.lineTo(W / 2 - 90, legendY - 3);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2 - 100, legendY - 3, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('Invested', W / 2 - 84, legendY);

    // Balance
    ctx.beginPath();
    ctx.moveTo(W / 2 + 10, legendY - 3);
    ctx.lineTo(W / 2 + 30, legendY - 3);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2 + 20, legendY - 3, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Balance', W / 2 + 36, legendY);
  }

  function abbreviateNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return n.toFixed(0);
  }

  // ──────────────────────── INIT ────────────────────────

  ciCalculate.addEventListener('click', calculateCompoundInterest);

  // Also calc on enter key
  [ciPrincipal, ciMonthly, ciRate, ciPeriod, ciFxUsd, ciFxEur].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') calculateCompoundInterest();
    });
  });

  // Boot
  loadRates();
  loadBrazilianRates();
  calculateCompoundInterest();
})();
