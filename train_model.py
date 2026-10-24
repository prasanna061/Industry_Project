
from pathlib import Path
import json

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error


DATA_PATH = Path("data/sambhal_onion_prices.csv")
MODEL_DIR = Path("models")
HORIZON = 7

LAGS = [1, 2, 3, 7, 14, 21, 30]
WINDOWS = [7, 14, 30]

# Four configurations to tune XGBoost for our historical dataset.
PARAM_CANDIDATES = [
    {
        "n_estimators": 300, "max_depth": 2,
        "learning_rate": 0.03, "min_child_weight": 5,
        "subsample": 0.90, "colsample_bytree": 0.90,
        "reg_lambda": 5,
    },
    {
        "n_estimators": 500, "max_depth": 2,
        "learning_rate": 0.02, "min_child_weight": 5,
        "subsample": 0.90, "colsample_bytree": 0.90,
        "reg_lambda": 8,
    },
    {
        "n_estimators": 350, "max_depth": 3,
        "learning_rate": 0.03, "min_child_weight": 5,
        "subsample": 0.85, "colsample_bytree": 0.85,
        "reg_lambda": 8,
    },
    {
        "n_estimators": 500, "max_depth": 3,
        "learning_rate": 0.02, "min_child_weight": 8,
        "subsample": 0.90, "colsample_bytree": 0.85,
        "reg_lambda": 10,
    },
]


def load_prices():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH, parse_dates=["report_date"])
    df["report_date"] = df["report_date"].dt.normalize()
    df["modal_price"] = pd.to_numeric(
        df["modal_price"], errors="coerce"
    )

    df = df.dropna(subset=["report_date", "modal_price"])
    df = df[df["modal_price"] > 0]
    df = df.sort_values("report_date")
    df = df.drop_duplicates("report_date", keep="last")

    # Missing dates are represented as NaN, not fabricated observations.
    prices = (
        df.set_index("report_date")["modal_price"]
        .asfreq("D")
        .sort_index()
    )

    if prices.notna().sum() < 200:
        raise ValueError("Insufficient valid historical price observations.")

    print(f"Historical observations: {prices.notna().sum():,}")
    print(f"First date: {prices.first_valid_index().date()}")
    print(f"Last date:  {prices.last_valid_index().date()}")

    return prices


def make_features(prices):
    features = pd.DataFrame(index=prices.index)

    # Previous recorded-calendar-day price values.
    for lag in LAGS:
        features[f"lag_{lag}"] = prices.shift(lag)

    previous = prices.shift(1)

    # Recent price levels and variability.
    for window in WINDOWS:
        features[f"mean_{window}"] = (
            previous.rolling(window).mean()
        )
        features[f"std_{window}"] = (
            previous.rolling(window).std()
        )

    # Price momentum.
    features["momentum_7"] = (
        prices.shift(1) - prices.shift(7)
    )
    features["momentum_30"] = (
        prices.shift(1) - prices.shift(30)
    )

    # Calendar seasonality.
    features["day_of_week"] = prices.index.dayofweek
    features["month"] = prices.index.month
    features["day_of_year_sin"] = np.sin(
        2 * np.pi * prices.index.dayofyear / 365.25
    )
    features["day_of_year_cos"] = np.cos(
        2 * np.pi * prices.index.dayofyear / 365.25
    )

    return features


def create_supervised_data(observed_prices):
    # Fill missing dates only for historical feature construction.
    # Actual missing prices are still excluded as training targets.
    feature_prices = observed_prices.ffill()
    features = make_features(feature_prices)

    dataset = features.copy()
    dataset["target"] = observed_prices
    dataset = dataset.dropna()

    feature_columns = list(features.columns)
    return dataset, feature_columns


def create_model(params):
    return xgb.XGBRegressor(
        objective="reg:squarederror",
        random_state=42,
        n_jobs=-1,
        **params,
    )


def forecast_next_days(model, historical_prices, feature_columns):
    history = historical_prices.ffill().copy()
    predictions = {}

    for _ in range(HORIZON):
        next_date = history.index[-1] + pd.Timedelta(days=1)

        # Add a future date without inventing its actual price.
        extended = pd.concat([
            history,
            pd.Series([np.nan], index=[next_date]),
        ]).asfreq("D")

        features = make_features(extended)
        row = features.loc[[next_date], feature_columns]

        if row.isna().any(axis=None):
            missing = row.columns[row.isna().any()].tolist()
            raise ValueError(
                f"Missing features for {next_date.date()}: {missing}"
            )

        predicted_price = max(
            0.0, float(model.predict(row)[0])
        )

        predictions[next_date] = predicted_price

        # Recursive forecast: use this prediction for later days.
        history.loc[next_date] = predicted_price

    return predictions


def calculate_metrics(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)

    if len(actual) == 0:
        return {"MAE": np.nan, "RMSE": np.nan, "MAPE": np.nan}

    return {
        "MAE": float(mean_absolute_error(actual, predicted)),
        "RMSE": float(np.sqrt(
            mean_squared_error(actual, predicted)
        )),
        "MAPE": float(
            np.mean(np.abs((actual - predicted) / actual)) * 100
        ),
    }


def evaluate_origins(
    observed_prices, supervised, feature_columns, params, origins
):
    actual_values = []
    xgb_values = []
    baseline_values = []

    for origin in origins:
        training = supervised.loc[supervised.index <= origin]

        if len(training) < 100:
            continue

        model = create_model(params)
        model.fit(
            training[feature_columns],
            training["target"],
        )

        history = observed_prices.loc[:origin]
        predictions = forecast_next_days(
            model, history, feature_columns
        )

        past_actuals = history.dropna()
        if past_actuals.empty:
            continue

        # Seven-day persistence baseline: hold the latest
        # observed price constant throughout the horizon.
        baseline_price = float(past_actuals.iloc[-1])

        end_date = origin + pd.Timedelta(days=HORIZON)
        actual_window = observed_prices.loc[
            (observed_prices.index > origin)
            & (observed_prices.index <= end_date)
        ]

        for target_date, actual_price in actual_window.items():
            # Score only genuinely observed prices.
            if pd.isna(actual_price):
                continue

            actual_values.append(float(actual_price))
            xgb_values.append(predictions[target_date])
            baseline_values.append(baseline_price)

    if not actual_values:
        raise ValueError(
            "No observed prices available for backtesting."
        )

    return (
        calculate_metrics(actual_values, xgb_values),
        calculate_metrics(actual_values, baseline_values),
        len(actual_values),
    )


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    observed = load_prices()
    supervised, feature_columns = create_supervised_data(observed)

    latest_date = observed.last_valid_index()

    # Tune on the 12 weeks preceding the final 4-week test period.
    tuning_start = latest_date - pd.Timedelta(days=112)
    tuning_origins = list(
        pd.date_range(tuning_start, periods=12, freq="7D")
    )

    # Independent final period for assessing the selected settings.
    test_start = latest_date - pd.Timedelta(days=28)
    test_origins = list(
        pd.date_range(test_start, periods=4, freq="7D")
    )

    if supervised.index.min() >= tuning_start:
        raise ValueError(
            "Not enough earlier data for the configured backtest."
        )

    print("\n--- XGBoost Hyperparameter Tuning ---")

    candidate_results = []

    for number, params in enumerate(PARAM_CANDIDATES, start=1):
        xgb_metrics, baseline_metrics, count = evaluate_origins(
            observed,
            supervised,
            feature_columns,
            params,
            tuning_origins,
        )

        candidate_results.append({
            "params": params,
            "metrics": xgb_metrics,
            "baseline": baseline_metrics,
        })

        print(
            f"Candidate {number}/{len(PARAM_CANDIDATES)} | "
            f"MAE: Rs {xgb_metrics['MAE']:.2f}/quintal | "
            f"Baseline MAE: Rs {baseline_metrics['MAE']:.2f}/quintal"
        )

    # Select parameters using the lowest tuning-period MAE.
    best = min(
        candidate_results,
        key=lambda result: result["metrics"]["MAE"],
    )
    best_params = best["params"]

    print("\n--- Final Holdout Evaluation: 7-Day Forecasts ---")

    test_metrics, test_baseline, test_count = evaluate_origins(
        observed,
        supervised,
        feature_columns,
        best_params,
        test_origins,
    )

    print(f"Best configuration: {best_params}")
    print(f"Observed test prices scored: {test_count}")
    print(
        f"XGBoost MAE: Rs {test_metrics['MAE']:.2f}/quintal"
    )
    print(
        f"Baseline MAE: Rs {test_baseline['MAE']:.2f}/quintal"
    )
    print(
        f"XGBoost RMSE: Rs {test_metrics['RMSE']:.2f}/quintal"
    )
    print(
        f"XGBoost MAPE: {test_metrics['MAPE']:.2f}%"
    )

    # Train the selected configuration on all available observations.
    final_model = create_model(best_params)
    final_model.fit(
        supervised[feature_columns],
        supervised["target"],
    )

    model_path = MODEL_DIR / "mandi_xgboost.json"
    final_model.save_model(model_path)

    # Generate the next seven calendar-day forecasts from the
    # last date available in the selected historical dataset.
    forecasts = forecast_next_days(
        final_model,
        observed.loc[:latest_date],
        feature_columns,
    )

    forecast_rows = [
        {
            "report_date": day.date().isoformat(),
            "predicted_modal_price": round(price, 2),
            "unit": "Rs/quintal",
        }
        for day, price in forecasts.items()
    ]

    forecast_path = MODEL_DIR / "forecast_7_days.csv"
    pd.DataFrame(forecast_rows).to_csv(forecast_path, index=False)

    config = {
        "market": "Sambhal",
        "state": "Uttar Pradesh",
        "commodity": "Onion",
        "target": "modal_price",
        "unit": "Rs/quintal",
        "horizon_days": HORIZON,
        "training_data_latest_date": latest_date.date().isoformat(),
        "features": feature_columns,
        "selected_parameters": best_params,
        "final_test_mae": round(test_metrics["MAE"], 2),
        "final_test_rmse": round(test_metrics["RMSE"], 2),
        "final_test_mape_percent": round(test_metrics["MAPE"], 2),
        "final_test_baseline_mae": round(test_baseline["MAE"], 2),
        "test_observations_scored": test_count,
    }

    with (MODEL_DIR / "model_config.json").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(config, file, indent=2)

    print("\n--- Seven-Day Forecast ---")
    for row in forecast_rows:
        print(
            f"{row['report_date']}: "
            f"Rs {row['predicted_modal_price']:.2f}/quintal"
        )

    print("\nSaved:")
    print(f"  {model_path}")
    print(f"  {MODEL_DIR / 'model_config.json'}")
    print(f"  {forecast_path}")

    print(
        "\nForecast dates begin after the dataset's last observation. "
        "These are estimates, not guaranteed prices."
    )


if __name__ == "__main__":
    main()
