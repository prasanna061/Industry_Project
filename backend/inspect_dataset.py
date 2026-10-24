
import csv
from pathlib import Path
from datetime import datetime

file_path = Path(
    "data/APMC_Arrivals_And_Prices__Old_Data_download/historical_prices.csv"
)

total_rows = 0
earliest_date = None
latest_date = None
unique_dates = set()

print("Inspecting historical mandi dataset...")

with file_path.open("r", encoding="utf-8-sig", newline="") as file:
    reader = csv.DictReader(file)

    print("Columns:", reader.fieldnames)

    for row in reader:
        total_rows += 1

        date_text = row.get("report_date", "").strip()
        if date_text:
            try:
                date = datetime.strptime(date_text, "%Y-%m-%d").date()
                earliest_date = date if earliest_date is None else min(earliest_date, date)
                latest_date = date if latest_date is None else max(latest_date, date)
                unique_dates.add(date)
            except ValueError:
                pass

        if total_rows % 1_000_000 == 0:
            print(f"Processed {total_rows:,} rows...")

print("\n--- Dataset Summary ---")
print(f"Total records: {total_rows:,}")
print(f"Earliest date: {earliest_date}")
print(f"Latest date: {latest_date}")
print(f"Unique dates: {len(unique_dates):,}")
