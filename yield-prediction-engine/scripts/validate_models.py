"""
Historical backtesting script — validates trained models against FAO actuals.

Checks that actual yields from a holdout period (2018–2023) fall within the
predicted P10–P90 interval. Prints a coverage report per model.

Usage:
    python scripts/validate_models.py --data path/to/faostat_zimbabwe.csv --holdout-start 2018
"""

import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--holdout-start", type=int, default=2018)
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    holdout = df[df["year"] >= args.holdout_start].copy()
    logger.info("Holdout set: %d rows (year >= %d)", len(holdout), args.holdout_start)

    from train_all import prepare_features
    from features.builder import FEATURE_COLUMNS
    from prediction.probabilistic import predict_distribution
    from config.zones import NATURAL_REGIONS, SYSTEM_TYPES

    holdout = prepare_features(holdout)

    results = []
    for region in NATURAL_REGIONS:
        for system_type in SYSTEM_TYPES:
            subset = holdout[
                (holdout["natural_region"] == region) &
                (holdout["system_type"] == system_type)
            ]
            if subset.empty:
                continue

            covered = 0
            for _, row in subset.iterrows():
                X = pd.DataFrame([row[FEATURE_COLUMNS].values], columns=FEATURE_COLUMNS)
                try:
                    dist = predict_distribution(X, region, system_type, str(row.get("crop", "Maize")))
                    actual = row["yield_hg_ha"]
                    if dist.p10 <= actual <= dist.p90:
                        covered += 1
                except FileNotFoundError:
                    continue

            n = len(subset)
            coverage = covered / n if n > 0 else 0.0
            results.append({
                "model": f"region_{region}_{system_type}",
                "n": n,
                "p10_p90_coverage": round(coverage * 100, 1),
                "target_coverage": 80.0,
                "pass": coverage >= 0.70,
            })

    print("\n=== Backtesting Results ===")
    print(f"{'Model':<35} {'N':>5} {'Coverage':>10} {'Pass':>6}")
    print("-" * 60)
    for r in results:
        status = "PASS" if r["pass"] else "FAIL"
        print(f"{r['model']:<35} {r['n']:>5} {r['p10_p90_coverage']:>9.1f}% {status:>6}")

    passed = sum(1 for r in results if r["pass"])
    print(f"\n{passed}/{len(results)} models passed (≥70% P10–P90 coverage)")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
