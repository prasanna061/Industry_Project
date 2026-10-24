
import csv
from pathlib import Path

file_path = Path(
    "data/APMC_Arrivals_And_Prices__Old_Data_download/historical_prices.csv"
)

target_state = "Uttar Pradesh"
target_market = "Sambhal"
target_crop = "Onion"

dates = set()
count = 0

with file_path.open("r", encoding="utf-8-sig", newline="") as file:
    reader = csv.DictReader(file)

    for row in reader:
        if (
            row["state_name"].strip() == target_state
            and row["market_center"].strip() == target_market
            and row["commodity"].strip().lower() == target_crop.lower()
        ):
            dates.add(row["report_date"].strip())
            count += 1

print(f"Market: {target_market}, {target_state}")
print(f"Crop: {target_crop}")
print(f"Records: {count:,}")
print(f"Distinct dates: {len(dates):,}")
print(f"Earliest date: {min(dates) if dates else 'None'}")
print(f"Latest date: {max(dates) if dates else 'None'}")
