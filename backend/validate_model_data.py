
import csv
from pathlib import Path
from datetime import date, timedelta

file_path = Path("data/sambhal_onion_prices.csv")

records = []
with file_path.open("r", encoding="utf-8", newline="") as file:
    reader = csv.DictReader(file)
    records = list(reader)

dates = [date.fromisoformat(row["report_date"]) for row in records]
prices = []

invalid_prices = 0
for row in records:
    try:
        price = float(row["modal_price"])
        if price <= 0:
            invalid_prices += 1
        else:
            prices.append(price)
    except (ValueError, TypeError):
        invalid_prices += 1

unique_dates = set(dates)
expected_days = (max(dates) - min(dates)).days + 1

print("--- Data Quality Report ---")
print(f"Total records: {len(records):,}")
print(f"Duplicate dates: {len(dates) - len(unique_dates):,}")
print(f"Calendar days in range: {expected_days:,}")
print(f"Missing calendar dates: {expected_days - len(unique_dates):,}")
print(f"Invalid or non-positive modal prices: {invalid_prices:,}")

if prices:
    print(f"Minimum modal price: Rs {min(prices):,.2f}/quintal")
    print(f"Maximum modal price: Rs {max(prices):,.2f}/quintal")
    print(f"Average modal price: Rs {sum(prices) / len(prices):,.2f}/quintal")
