
import csv
from pathlib import Path
from collections import defaultdict

file_path = Path(
    "data/APMC_Arrivals_And_Prices__Old_Data_download/historical_prices.csv"
)

target_crops = {"onion", "soyabean", "tomato"}
stats = defaultdict(lambda: {"records": 0, "dates": set(), "markets": set()})

with file_path.open("r", encoding="utf-8-sig", newline="") as file:
    reader = csv.DictReader(file)

    for row in reader:
        crop = row.get("commodity", "").strip().lower()

        if crop not in target_crops:
            continue

        item = stats[crop]
        item["records"] += 1

        date = row.get("report_date", "").strip()
        market = row.get("market_center", "").strip()
        state = row.get("state_name", "").strip()

        if date:
            item["dates"].add(date)

        if market and state:
            item["markets"].add((state, market))

print("\n--- Historical Coverage ---")

for crop in sorted(target_crops):
    item = stats[crop]
    print(f"\n{crop.title()}")
    print(f"Records: {item['records']:,}")
    print(f"Distinct dates: {len(item['dates']):,}")
    print(f"Distinct state-market pairs: {len(item['markets']):,}")
