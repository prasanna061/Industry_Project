
import csv
from pathlib import Path
from collections import Counter

file_path = Path(
    "data/APMC_Arrivals_And_Prices__Old_Data_download/historical_prices.csv"
)

market_counts = Counter()

with file_path.open("r", encoding="utf-8-sig", newline="") as file:
    reader = csv.DictReader(file)

    for row in reader:
        if row.get("commodity", "").strip().lower() == "onion":
            state = row.get("state_name", "").strip()
            market = row.get("market_center", "").strip()

            if state and market:
                market_counts[(state, market)] += 1

print("\nTop 10 Onion Markets by Record Count:")
for (state, market), count in market_counts.most_common(10):
    print(f"{state} | {market} | {count:,} records")
