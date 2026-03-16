from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import pandas as pd


def load_csv(file_path_or_buffer) -> pd.DataFrame:
    return pd.read_csv(file_path_or_buffer)


def clean_and_compute_metrics(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Standardize column names
    df.columns = [str(c).strip() for c in df.columns]
    df.columns = [c.lower() for c in df.columns]

    # Infer expected logical columns
    rename_map: Dict[str, str] = {}
    for col in df.columns:
        col_l = col.lower()

        if "keyword" in col_l and "id" not in col_l:
            rename_map[col] = "keyword"
        if "campaign" in col_l:
            rename_map[col] = "campaign"
        if "impression" in col_l:
            rename_map[col] = "impressions"
        if col_l in {"clicks", "click"}:
            rename_map[col] = "clicks"
        # Distinguish between "Conversions" and "Conversion Rate"
        if "conversion rate" in col_l or "conv rate" in col_l:
            rename_map[col] = "conversion_rate_input"
        elif "convers" in col_l:
            rename_map[col] = "conversions"
        if col_l in {"cost", "spend", "amount"}:
            rename_map[col] = "cost"

    df = df.rename(columns=rename_map)

    # Ensure numeric columns exist
    for col in ["impressions", "clicks", "conversions", "cost"]:
        if col not in df.columns:
            df[col] = 0

    # Convert numeric safely (handles duplicate column names)
    for col in ["impressions", "clicks", "conversions", "cost"]:
        values = df[col]
        if isinstance(values, pd.DataFrame):
            values = values.apply(pd.to_numeric, errors="coerce").sum(axis=1)
        df[col] = pd.to_numeric(values, errors="coerce").fillna(0)

    # Metrics
    df["ctr"] = 0.0
    nonzero_impr = df["impressions"] > 0
    df.loc[nonzero_impr, "ctr"] = df.loc[nonzero_impr, "clicks"] / df.loc[nonzero_impr, "impressions"]

    df["conversion_rate"] = 0.0
    nonzero_clicks = df["clicks"] > 0
    df.loc[nonzero_clicks, "conversion_rate"] = (
        df.loc[nonzero_clicks, "conversions"] / df.loc[nonzero_clicks, "clicks"]
    )

    df["cost_per_conversion"] = 0.0
    nonzero_conv = df["conversions"] > 0
    df.loc[nonzero_conv, "cost_per_conversion"] = df.loc[nonzero_conv, "cost"] / df.loc[nonzero_conv, "conversions"]

    return df


def apply_rules(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    def rule_recommendations(row) -> List[str]:
        recs: List[str] = []
        ctr_pct = float(row.get("ctr", 0) or 0) * 100
        conv_rate_pct = float(row.get("conversion_rate", 0) or 0) * 100
        cost = float(row.get("cost", 0) or 0)
        conversions = float(row.get("conversions", 0) or 0)
        impressions = float(row.get("impressions", 0) or 0)

        if impressions > 0 and ctr_pct < 5:
            recs.append("CTR < 5%: Improve the ad (copy/creative/targeting).")
        if ctr_pct > 10:
            recs.append("CTR > 10%: Increase the price/bid (strong demand).")
        if cost > 0 and conversions == 0:
            recs.append("High cost + zero conversions: Pause keyword or reduce bid.")
        if conv_rate_pct > 10:
            recs.append("High conversion rate: Increase the price/bid.")
        if impressions > 1000 and ctr_pct < 3:
            recs.append("High impressions + low CTR: Keyword relevance issue.")

        if not recs:
            recs.append("No major issues detected: Monitor.")
        return recs

    df["recommendations"] = df.apply(rule_recommendations, axis=1)
    return df


def compute_insights(df: pd.DataFrame) -> dict:
    if df is None or df.empty:
        return {"top_keywords": [], "wasting_budget": [], "opportunities": [], "summary": {}}

    total_impressions = float(df["impressions"].sum())
    total_clicks = float(df["clicks"].sum())
    total_conversions = float(df["conversions"].sum())
    total_cost = float(df["cost"].sum())

    overall_ctr = (total_clicks / total_impressions) if total_impressions > 0 else 0.0
    overall_cr = (total_conversions / total_clicks) if total_clicks > 0 else 0.0
    overall_cpc = (total_cost / total_clicks) if total_clicks > 0 else 0.0
    overall_cpa = (total_cost / total_conversions) if total_conversions > 0 else 0.0

    top_keywords_df = df.sort_values(["conversions", "ctr"], ascending=[False, False]).head(10).copy()

    wasting_budget_df = df[(df["cost"] > df["cost"].median()) & (df["conversions"] == 0)].copy()

    opportunities_df = df[
        ((df["impressions"] > df["impressions"].median()) & (df["ctr"] < 0.05))
        | ((df["clicks"] > df["clicks"].median()) & (df["conversion_rate"] < 0.05))
    ].copy()

    def to_records(frame: pd.DataFrame) -> List[dict]:
        if frame is None or frame.empty:
            return []
        cols = [
            c
            for c in [
                "keyword",
                "campaign",
                "impressions",
                "clicks",
                "conversions",
                "cost",
                "ctr",
                "conversion_rate",
                "cost_per_conversion",
                "recommendations",
            ]
            if c in frame.columns
        ]
        frame = frame.copy()
        if "recommendations" in cols:
            frame["recommendations"] = frame["recommendations"].apply(
                lambda v: "; ".join(v) if isinstance(v, list) else str(v)
            )
        return frame[cols].to_dict(orient="records")

    return {
        "top_keywords": to_records(top_keywords_df),
        "wasting_budget": to_records(wasting_budget_df),
        "opportunities": to_records(opportunities_df),
        "summary": {
            "total_impressions": total_impressions,
            "total_clicks": total_clicks,
            "total_conversions": total_conversions,
            "total_cost": total_cost,
            "overall_ctr": overall_ctr,
            "overall_cr": overall_cr,
            "overall_cpc": overall_cpc,
            "overall_cpa": overall_cpa,
        },
    }


def agent_text_summary(insights: dict) -> str:
    s = insights.get("summary", {}) or {}
    if not s:
        return "No data loaded yet. Upload a CSV file to generate insights."

    total_impressions = s.get("total_impressions", 0)
    total_clicks = s.get("total_clicks", 0)
    total_conversions = s.get("total_conversions", 0)
    total_cost = s.get("total_cost", 0.0)
    overall_ctr = s.get("overall_ctr", 0.0)
    overall_cr = s.get("overall_cr", 0.0)
    overall_cpa = s.get("overall_cpa", 0.0)

    top_count = len(insights.get("top_keywords", []))
    wasting_count = len(insights.get("wasting_budget", []))
    opp_count = len(insights.get("opportunities", []))

    parts = [
        f"Impressions: {int(total_impressions):,}, Clicks: {int(total_clicks):,}, "
        f"Conversions: {int(total_conversions):,}, Spend: ${total_cost:,.2f}.",
        f"Overall CTR: {overall_ctr*100:.2f}%, Conversion Rate: {overall_cr*100:.2f}%, "
        f"Avg CPA: ${overall_cpa:,.2f}." if overall_cpa else
        f"Overall CTR: {overall_ctr*100:.2f}%, Conversion Rate: {overall_cr*100:.2f}%.",
    ]

    if wasting_count:
        parts.append(
            f"{wasting_count} keywords are spending above typical levels with zero conversions—pause or reduce bids first."
        )
    if top_count:
        parts.append(f"Top performers identified: {top_count}—consider increasing bids and expanding coverage.")
    if opp_count:
        parts.append(f"{opp_count} optimization candidates detected—improve relevance, ads, and landing pages.")

    parts.append("Next step: shift budget from waste to winners, then iterate creative and targeting weekly.")
    return " ".join(parts)


def build_from_df(df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, dict, str]:
    df = clean_and_compute_metrics(df_raw)
    df = apply_rules(df)
    insights = compute_insights(df)
    summary = agent_text_summary(insights)
    return df, insights, summary

