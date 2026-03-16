from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from ads_agent import load_csv, build_from_df


BASE_DIR = Path(__file__).parent
DEFAULT_CSV = BASE_DIR / "GoogleAds_DataAnalytics_Sales_Uncleaned.csv"


st.set_page_config(
    page_title="Ads Optimization Agent",
    page_icon="📈",
    layout="wide",
)


def _format_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def _load_default_if_exists() -> pd.DataFrame | None:
    if DEFAULT_CSV.exists():
        return load_csv(DEFAULT_CSV)
    return None


st.title("Ads Optimization Agent Dashboard")
st.caption("Upload Google Ads keyword performance CSV, compute metrics, apply rules, and get recommendations.")

with st.sidebar:
    st.subheader("Data ingestion")
    uploaded = st.file_uploader("Upload a CSV file", type=["csv"])
    use_default = st.toggle("Use default CSV (if present)", value=True, help=str(DEFAULT_CSV.name))

    st.divider()
    st.subheader("Rules thresholds")
    low_ctr = st.slider("Low CTR threshold (%)", min_value=1, max_value=10, value=5)
    high_ctr = st.slider("High CTR threshold (%)", min_value=5, max_value=25, value=10)
    high_cr = st.slider("High Conversion Rate threshold (%)", min_value=1, max_value=30, value=10)
    high_impr = st.number_input("High impressions threshold", min_value=0, value=1000, step=100)
    relevance_ctr = st.slider("Relevance issue CTR threshold (%)", min_value=1, max_value=10, value=3)


df_raw = None
source_label = None

if uploaded is not None:
    df_raw = load_csv(uploaded)
    source_label = f"Uploaded file: {uploaded.name}"
elif use_default:
    df_raw = _load_default_if_exists()
    source_label = f"Default file: {DEFAULT_CSV.name}" if df_raw is not None else None


if df_raw is None:
    st.info("No data loaded yet. Upload a CSV in the sidebar, or place the default CSV in the repo root.")
    st.stop()


# Build metrics/rules/insights
df, insights, agent_summary = build_from_df(df_raw)

# Apply user-tuned thresholds by re-writing the recommendation text only (metrics stay consistent)
def _recs_with_thresholds(row) -> str:
    recs = []
    ctr_pct = float(row.get("ctr", 0) or 0) * 100
    cr_pct = float(row.get("conversion_rate", 0) or 0) * 100
    cost = float(row.get("cost", 0) or 0)
    conv = float(row.get("conversions", 0) or 0)
    impr = float(row.get("impressions", 0) or 0)

    if impr > 0 and ctr_pct < low_ctr:
        recs.append(f"CTR < {low_ctr}%: Improve the ad.")
    if ctr_pct > high_ctr:
        recs.append(f"CTR > {high_ctr}%: Increase bid/price.")
    if cost > 0 and conv == 0:
        recs.append("High cost + zero conversions: Pause/reduce bid.")
    if cr_pct > high_cr:
        recs.append(f"High conversion rate > {high_cr}%: Increase bid/price.")
    if impr > high_impr and ctr_pct < relevance_ctr:
        recs.append("High impressions + low CTR: Keyword relevance issue.")
    if not recs:
        recs.append("Monitor.")
    return "; ".join(recs)


df = df.copy()
df["recommendations"] = df.apply(_recs_with_thresholds, axis=1)


st.success(source_label or "Data loaded")

summary = insights.get("summary", {}) or {}

col1, col2, col3, col4 = st.columns(4)
col1.metric("Total Impressions", f"{summary.get('total_impressions', 0):,.0f}")
col2.metric("Total Clicks", f"{summary.get('total_clicks', 0):,.0f}", f"CTR {_format_pct(summary.get('overall_ctr', 0))}")
col3.metric(
    "Total Conversions",
    f"{summary.get('total_conversions', 0):,.0f}",
    f"CVR {_format_pct(summary.get('overall_cr', 0))}",
)
col4.metric("Total Spend", f"${summary.get('total_cost', 0):,.2f}", f"CPA ${summary.get('overall_cpa', 0):,.2f}" if summary.get("overall_cpa", 0) else None)

st.divider()

left, right = st.columns([1.2, 0.8], gap="large")

with right:
    st.subheader("AI Optimization Agent")
    st.write(agent_summary)
    st.caption(
        f"Top keywords: {len(insights.get('top_keywords', []))} • "
        f"Wasted spend: {len(insights.get('wasting_budget', []))} • "
        f"Opportunities: {len(insights.get('opportunities', []))}"
    )

with left:
    st.subheader("Charts (top keywords by impressions)")
    top = df.sort_values("impressions", ascending=False).head(15).copy()
    if "keyword" not in top.columns:
        top["keyword"] = top.index.astype(str)

    chart_df = top[["keyword", "ctr", "conversion_rate", "cost"]].copy()
    chart_df["ctr_pct"] = (chart_df["ctr"] * 100).round(2)
    chart_df["conversion_rate_pct"] = (chart_df["conversion_rate"] * 100).round(2)

    st.bar_chart(chart_df.set_index("keyword")[["ctr_pct", "conversion_rate_pct"]])
    st.bar_chart(chart_df.set_index("keyword")[["cost"]])

st.divider()

st.subheader("Keyword performance table")
cols = [c for c in ["keyword", "campaign", "impressions", "clicks", "conversions", "cost", "ctr", "conversion_rate", "cost_per_conversion", "recommendations"] if c in df.columns]
table = df[cols].copy()
if "ctr" in table.columns:
    table["ctr"] = (table["ctr"] * 100).round(2)
if "conversion_rate" in table.columns:
    table["conversion_rate"] = (table["conversion_rate"] * 100).round(2)
st.dataframe(table, use_container_width=True, height=340)

st.divider()

c1, c2, c3 = st.columns(3, gap="large")
with c1:
    st.subheader("Top performing keywords")
    st.dataframe(pd.DataFrame(insights.get("top_keywords", [])), use_container_width=True, height=260)
with c2:
    st.subheader("Keywords wasting budget")
    st.dataframe(pd.DataFrame(insights.get("wasting_budget", [])), use_container_width=True, height=260)
with c3:
    st.subheader("Optimization opportunities")
    st.dataframe(pd.DataFrame(insights.get("opportunities", [])), use_container_width=True, height=260)

Fix streamlit Python compatibility 
