/* global Papa, Chart */

const fmtInt = (n) => Number(n || 0).toLocaleString();
const fmtMoney = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (x) => `${(Number(x || 0) * 100).toFixed(2)}%`;

const els = {
  fileInput: document.getElementById("fileInput"),
  loadSample: document.getElementById("loadSample"),
  clear: document.getElementById("clear"),
  banner: document.getElementById("banner"),
  sourceLabel: document.getElementById("sourceLabel"),
  mImpr: document.getElementById("mImpr"),
  mClicks: document.getElementById("mClicks"),
  mConv: document.getElementById("mConv"),
  mCost: document.getElementById("mCost"),
  mCtr: document.getElementById("mCtr"),
  mCvr: document.getElementById("mCvr"),
  mCpa: document.getElementById("mCpa"),
  agent: document.getElementById("agent"),
  cTop: document.getElementById("cTop"),
  cWaste: document.getElementById("cWaste"),
  cOpp: document.getElementById("cOpp"),
  topTable: document.querySelector("#topTable tbody"),
  wasteTable: document.querySelector("#wasteTable tbody"),
  oppTable: document.querySelector("#oppTable tbody"),
};

let ctrChart = null;
let costChart = null;

function setBanner(type, text) {
  els.banner.classList.remove("hidden", "bad", "good");
  if (!text) {
    els.banner.classList.add("hidden");
    els.banner.textContent = "";
    return;
  }
  if (type === "bad") els.banner.classList.add("bad");
  if (type === "good") els.banner.classList.add("good");
  els.banner.textContent = text;
}

function clearTables() {
  els.topTable.innerHTML = "";
  els.wasteTable.innerHTML = "";
  els.oppTable.innerHTML = "";
}

function resetUI() {
  setBanner(null, "");
  els.sourceLabel.textContent = "No file loaded";
  els.mImpr.textContent = "—";
  els.mClicks.textContent = "—";
  els.mConv.textContent = "—";
  els.mCost.textContent = "—";
  els.mCtr.textContent = "CTR —";
  els.mCvr.textContent = "CVR —";
  els.mCpa.textContent = "CPA —";
  els.agent.textContent = "Upload a CSV to generate an AI-style report.";
  els.cTop.textContent = "0";
  els.cWaste.textContent = "0";
  els.cOpp.textContent = "0";
  clearTables();
  destroyCharts();
}

function destroyCharts() {
  if (ctrChart) ctrChart.destroy();
  if (costChart) costChart.destroy();
  ctrChart = null;
  costChart = null;
}

function normalizeColumns(columns) {
  // Lowercase + trim for matching
  return columns.map((c) => String(c || "").trim().toLowerCase());
}

function pickColumnIndex(cols, predicate) {
  const idx = cols.findIndex(predicate);
  return idx >= 0 ? idx : null;
}

function parseNumber(x) {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const s = String(x).trim();
  if (!s) return 0;
  // Handle currency like "$231.88" and thousands separators
  const cleaned = s.replace(/[$,]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractData(rows, originalHeaders) {
  const headers = normalizeColumns(originalHeaders);

  const idxKeyword = pickColumnIndex(headers, (h) => h.includes("keyword") && !h.includes("id"));
  const idxCampaign = pickColumnIndex(headers, (h) => h.includes("campaign"));
  const idxImpr = pickColumnIndex(headers, (h) => h.includes("impression"));
  const idxClicks = pickColumnIndex(headers, (h) => h === "clicks" || h === "click");
  const idxConv = pickColumnIndex(headers, (h) => h.includes("conversions") && !h.includes("conversion rate"));
  const idxCost = pickColumnIndex(headers, (h) => h === "cost" || h === "spend" || h === "amount");

  if (idxKeyword === null) {
    throw new Error("Could not find a Keyword column. Your CSV should include a column named like 'Keyword'.");
  }

  const out = [];
  for (const r of rows) {
    if (!r || r.length === 0) continue;
    const keyword = String(r[idxKeyword] ?? "").trim();
    if (!keyword) continue;

    const campaign = idxCampaign !== null ? String(r[idxCampaign] ?? "").trim() : "";
    const impressions = idxImpr !== null ? parseNumber(r[idxImpr]) : 0;
    const clicks = idxClicks !== null ? parseNumber(r[idxClicks]) : 0;
    const conversions = idxConv !== null ? parseNumber(r[idxConv]) : 0;
    const cost = idxCost !== null ? parseNumber(r[idxCost]) : 0;

    const ctr = impressions > 0 ? clicks / impressions : 0;
    const conversionRate = clicks > 0 ? conversions / clicks : 0;
    const costPerConversion = conversions > 0 ? cost / conversions : 0;

    out.push({
      keyword,
      campaign,
      impressions,
      clicks,
      conversions,
      cost,
      ctr,
      conversionRate,
      costPerConversion,
    });
  }
  return out;
}

function applyRules(row) {
  const ctrPct = row.ctr * 100;
  const cvrPct = row.conversionRate * 100;
  const recs = [];

  // Thresholds (simple defaults)
  if (row.impressions > 0 && ctrPct < 5) recs.push("CTR < 5% → improve the ad");
  if (ctrPct > 10) recs.push("CTR > 10% → increase the price/bid");
  if (row.cost > 0 && row.conversions === 0) recs.push("High cost + zero conversions → pause keyword");
  if (cvrPct > 10) recs.push("High conversion rate → increase the price/bid");
  if (row.impressions > 1000 && ctrPct < 3) recs.push("High impressions + low CTR → keyword relevance issue");

  if (recs.length === 0) recs.push("Monitor");
  return recs;
}

function computeInsights(data) {
  const totals = data.reduce(
    (acc, r) => {
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.conversions += r.conversions;
      acc.cost += r.cost;
      return acc;
    },
    { impressions: 0, clicks: 0, conversions: 0, cost: 0 }
  );

  const overallCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const overallCr = totals.clicks > 0 ? totals.conversions / totals.clicks : 0;
  const overallCpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;

  const enriched = data.map((r) => ({ ...r, recommendations: applyRules(r) }));

  const topKeywords = [...enriched]
    .sort((a, b) => (b.conversions - a.conversions) || (b.ctr - a.ctr))
    .slice(0, 10);

  const costs = enriched.map((r) => r.cost).sort((a, b) => a - b);
  const medianCost = costs.length ? costs[Math.floor(costs.length / 2)] : 0;

  const wastingBudget = enriched.filter((r) => r.cost > medianCost && r.conversions === 0).slice(0, 20);

  const imprs = enriched.map((r) => r.impressions).sort((a, b) => a - b);
  const medianImpr = imprs.length ? imprs[Math.floor(imprs.length / 2)] : 0;

  const clicksArr = enriched.map((r) => r.clicks).sort((a, b) => a - b);
  const medianClicks = clicksArr.length ? clicksArr[Math.floor(clicksArr.length / 2)] : 0;

  const opportunities = enriched
    .filter((r) => (r.impressions > medianImpr && r.ctr < 0.05) || (r.clicks > medianClicks && r.conversionRate < 0.05))
    .slice(0, 30);

  return {
    totals,
    overallCtr,
    overallCr,
    overallCpa,
    topKeywords,
    wastingBudget,
    opportunities,
    enriched,
  };
}

function agentSummary(ins) {
  const { totals, overallCtr, overallCr, overallCpa } = ins;

  const lines = [];
  lines.push(
    `Your campaigns generated ${fmtInt(totals.impressions)} impressions, ${fmtInt(totals.clicks)} clicks, and ${fmtInt(totals.conversions)} conversions with a total spend of ${fmtMoney(totals.cost)}.`
  );
  lines.push(
    `Overall CTR is ${fmtPct(overallCtr)}, conversion rate is ${fmtPct(overallCr)}, and average CPA is ${overallCpa ? fmtMoney(overallCpa) : "—"}.`
  );

  if (ins.topKeywords.length) {
    const best = ins.topKeywords[0];
    lines.push(`Top keyword is "${best.keyword}" with ${fmtInt(best.conversions)} conversions and CTR ${fmtPct(best.ctr)}. Consider increasing bids for top performers.`);
  }
  if (ins.wastingBudget.length) {
    lines.push(`We found ${fmtInt(ins.wastingBudget.length)} keywords likely wasting budget (high cost with zero conversions). Pause or reduce bids first, then review relevance and landing pages.`);
  } else {
    lines.push("No obvious wasted-spend keywords were detected using the default thresholds.");
  }
  if (ins.opportunities.length) {
    lines.push(`There are ${fmtInt(ins.opportunities.length)} optimization opportunities (high impressions + low CTR, or high clicks + low conversion). Improve ad relevance, test new creatives, and optimize landing pages.`);
  }

  lines.push("Recommended next step: shift budget from low-performing keywords into proven winners, then run weekly A/B tests on ads and landing pages.");
  return lines.join(" ");
}

function renderTables(ins) {
  clearTables();

  for (const r of ins.topKeywords) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.keyword)}</td>
      <td>${fmtInt(r.impressions)}</td>
      <td>${fmtInt(r.clicks)}</td>
      <td>${fmtInt(r.conversions)}</td>
      <td>${fmtPct(r.ctr)}</td>
      <td>${fmtPct(r.conversionRate)}</td>
      <td>${fmtMoney(r.cost)}</td>
      <td>${r.costPerConversion ? fmtMoney(r.costPerConversion) : "—"}</td>
    `;
    els.topTable.appendChild(tr);
  }

  for (const r of ins.wastingBudget) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.keyword)}</td>
      <td>${fmtInt(r.clicks)}</td>
      <td>${fmtMoney(r.cost)}</td>
      <td><span class="badge bad">Pause</span></td>
    `;
    els.wasteTable.appendChild(tr);
  }

  for (const r of ins.opportunities) {
    const rec = (r.recommendations || []).join("; ");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.keyword)}</td>
      <td>${fmtInt(r.impressions)}</td>
      <td>${fmtPct(r.ctr)}</td>
      <td>${fmtPct(r.conversionRate)}</td>
      <td title="${escapeAttr(rec)}">${escapeHtml(rec)}</td>
    `;
    els.oppTable.appendChild(tr);
  }
}

function renderCharts(ins) {
  destroyCharts();
  const top = [...ins.enriched].sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  const labels = top.map((r) => r.keyword);
  const ctr = top.map((r) => Number((r.ctr * 100).toFixed(2)));
  const cvr = top.map((r) => Number((r.conversionRate * 100).toFixed(2)));
  const cost = top.map((r) => Number((r.cost).toFixed(2)));

  const ctxCtr = document.getElementById("ctrChart");
  const ctxCost = document.getElementById("costChart");

  ctrChart = new Chart(ctxCtr, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "CTR %", data: ctr, backgroundColor: "rgba(96,165,250,.85)", borderRadius: 6 },
        { label: "Conversion Rate %", data: cvr, backgroundColor: "rgba(52,211,153,.90)", borderRadius: 6 },
      ],
    },
    options: chartOptions(),
  });

  costChart = new Chart(ctxCost, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Cost", data: cost, backgroundColor: "rgba(251,113,133,.90)", borderRadius: 6 }],
    },
    options: chartOptions(),
  });
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#e5e7eb", font: { size: 11 } } },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        ticks: { color: "#a1a1aa", maxRotation: 40, minRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        grid: { display: false },
      },
      y: { ticks: { color: "#a1a1aa" }, grid: { color: "rgba(75,85,99,.35)" } },
    },
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#096;");
}

function renderAll(ins) {
  els.mImpr.textContent = fmtInt(ins.totals.impressions);
  els.mClicks.textContent = fmtInt(ins.totals.clicks);
  els.mConv.textContent = fmtInt(ins.totals.conversions);
  els.mCost.textContent = fmtMoney(ins.totals.cost);
  els.mCtr.textContent = `CTR ${fmtPct(ins.overallCtr)}`;
  els.mCvr.textContent = `CVR ${fmtPct(ins.overallCr)}`;
  els.mCpa.textContent = `CPA ${ins.overallCpa ? fmtMoney(ins.overallCpa) : "—"}`;

  els.agent.textContent = agentSummary(ins);
  els.cTop.textContent = String(ins.topKeywords.length);
  els.cWaste.textContent = String(ins.wastingBudget.length);
  els.cOpp.textContent = String(ins.opportunities.length);

  renderTables(ins);
  renderCharts(ins);

  setBanner("good", "Dashboard updated. Your data stays in your browser.");
}

function parseCsvText(text, sourceLabel) {
  setBanner(null, "");
  Papa.parse(text, {
    skipEmptyLines: true,
    dynamicTyping: false,
    complete: (results) => {
      try {
        if (!results.data || results.data.length < 2) {
          throw new Error("CSV looks empty. Please upload a valid keyword performance CSV.");
        }
        const [headerRow, ...rows] = results.data;
        const data = extractData(rows, headerRow);
        if (!data.length) {
          throw new Error("No keyword rows found. Ensure your CSV has a 'Keyword' column and data rows.");
        }
        els.sourceLabel.textContent = sourceLabel;
        const ins = computeInsights(data);
        renderAll(ins);
      } catch (err) {
        console.error(err);
        setBanner("bad", err.message || "Failed to process CSV.");
        resetUI();
      }
    },
    error: (err) => {
      console.error(err);
      setBanner("bad", "Could not parse the CSV file. Please upload a valid CSV.");
      resetUI();
    },
  });
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    parseCsvText(String(text || ""), `Uploaded file: ${file.name}`);
  };
  reader.onerror = () => {
    setBanner("bad", "Could not read the file. Try again.");
  };
  reader.readAsText(file);
}

async function loadSample() {
  // Try to fetch the sample CSV if present in the repo (optional convenience).
  // If not present, show a friendly message.
  try {
    const res = await fetch("../GoogleAds_DataAnalytics_Sales_Uncleaned.csv");
    if (!res.ok) throw new Error("Sample CSV not found in repo root.");
    const text = await res.text();
    parseCsvText(text, "Sample: GoogleAds_DataAnalytics_Sales_Uncleaned.csv");
  } catch (e) {
    setBanner("bad", "Sample CSV is not available on the website. Please upload your CSV using 'Choose CSV'.");
  }
}

els.fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) loadFile(file);
});

els.loadSample.addEventListener("click", () => loadSample());
els.clear.addEventListener("click", () => {
  els.fileInput.value = "";
  resetUI();
  setBanner(null, "");
});

resetUI();

