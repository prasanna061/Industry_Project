
import csv
from pathlib import Path
from datetime import date

file_path = Path("data/sambhal_onion_prices.csv")

rows = []
with file_path.open("r", encoding="utf-8", newline="") as file:
    for row in csv.DictReader(file):
        rows.append({
            "date": date.fromisoformat(row["report_date"]),
            "price": float(row["modal_price"]),
        })

rows.sort(key=lambda row: row["date"])

# Chronological 80/20 split: older observations for training,
# newest observations for testing.
split_index = int(len(rows) * 0.8)
train = rows[:split_index]
test = rows[split_index:]

# Naive baseline: tomorrow's predicted price equals the
# latest available observed price.
predictions = [train[-1]["price"]]
predictions.extend(row["price"] for row in test[:-1])

actual = [row["price"] for row in test]

mae = sum(abs(a - p) for a, p in zip(actual, predictions)) / len(actual)
rmse = (
    sum((a - p) ** 2 for a, p in zip(actual, predictions)) / len(actual)
) ** 0.5

print("--- Baseline Evaluation ---")
print(f"Training records: {len(train):,}")
print(f"Testing records: {len(test):,}")
print(f"MAE: Rs {mae:.2f}/quintal")
print(f"RMSE: Rs {rmse:.2f}/quintal")
