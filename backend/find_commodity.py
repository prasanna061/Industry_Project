
import csv
from pathlib import Path

file_path = Path(
    "data/APMC_Arrivals_And_Prices__Old_Data_download/historical_prices.csv"
)

matches = set()

with file_path.open("r", encoding="utf-8-sig", newline="") as file:
    reader = csv.DictReader(file)

    for row in reader:
        commodity = row.get("commodity", "").strip()

        if "soy" in commodity.lower():
            matches.add(commodity)

print("Commodity names containing 'soy':")
for name in sorted(matches):
    print(name)

if not matches:
    print("No matches found.")
