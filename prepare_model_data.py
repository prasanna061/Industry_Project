
import csv
from pathlib import Path

source = Path(
    "data/APMC_Arrivals_And_Prices__Old_Data_download/historical_prices.csv"
)
output = Path("data/sambhal_onion_prices.csv")

count = 0

with source.open("r", encoding="utf-8-sig", newline="") as infile, \
     output.open("w", encoding="utf-8", newline="") as outfile:

    reader = csv.DictReader(infile)

    fields = [
        "report_date",
        "state_name",
        "district_name",
        "market_center",
        "commodity",
        "min_price",
        "max_price",
        "modal_price",
        "price_unit",
    ]

    writer = csv.DictWriter(outfile, fieldnames=fields)
    writer.writeheader()

    for row in reader:
        if (
            row["state_name"].strip() == "Uttar Pradesh"
            and row["market_center"].strip() == "Sambhal"
            and row["commodity"].strip().lower() == "onion"
        ):
            writer.writerow({field: row[field] for field in fields})
            count += 1

print(f"Saved {count:,} records to {output}")
