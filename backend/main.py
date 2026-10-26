from datetime import date
from functools import lru_cache
from pathlib import Path
import json

import numpy as np
import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


# --------------------------------------------------
# Paths and configuration
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

MODEL_PATH = MODEL_DIR / "mandi_xgboost.json"
CONFIG_PATH = MODEL_DIR / "model_config.json"
FORECAST_PATH = MODEL_DIR / "forecast_7_days.csv"
DATA_PATH = BASE_DIR / "data" / "sambhal_onion_prices.csv"

LAGS = [1, 2, 3, 7, 14, 21, 30]
WINDOWS = [7, 14, 30]

SUPPORTED_COMMODITY = "Onion"
SUPPORTED_MARKET = "Sambhal"
SUPPORTED_STATE = "Uttar Pradesh"
PRICE_UNIT = "Rs/quintal"


# --------------------------------------------------
# FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="Mandi Price Intelligence API",
    description=(
        "FastAPI backend for the Mandi Price Intelligence "
        "dashboard and its XGBoost price forecasting model."
    ),
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Load model and configuration
# --------------------------------------------------

@lru_cache(maxsize=1)
def get_config():
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Model configuration not found: {CONFIG_PATH}"
        )

    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


@lru_cache(maxsize=1)
def get_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Trained XGBoost model not found: {MODEL_PATH}"
        )

    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    return model


# --------------------------------------------------
# Load historical Sambhal onion prices
# --------------------------------------------------

@lru_cache(maxsize=1)
def get_price_series():
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            "Historical training data is missing. Place the "
            "sambhal_onion_prices.csv file in backend/data/."
        )

    df = pd.read_csv(DATA_PATH)

    required_columns = {"report_date", "modal_price"}
    if not required_columns.issubset(df.columns):
        raise ValueError(
            "The historical CSV must contain report_date "
            "and modal_price columns."
        )

    df["report_date"] = pd.to_datetime(
        df["report_date"], errors="coerce"
    ).dt.normalize()

    df["modal_price"] = pd.to_numeric(
        df["modal_price"], errors="coerce"
    )

    df = df.dropna(subset=["report_date", "modal_price"])
    df = df[df["modal_price"] > 0]
    df = df.sort_values("report_date")
    df = df.drop_duplicates("report_date", keep="last")

    if df.empty:
        raise ValueError("No valid historical prices were found.")

    prices = (
        df.set_index("report_date")["modal_price"]
        .asfreq("D")
        .sort_index()
    )

    if prices.notna().sum() < 30:
        raise ValueError(
            "Insufficient historical observations for forecasting."
        )

    return prices


# --------------------------------------------------
# Feature engineering
# Must match backend/train_model.py
# --------------------------------------------------

def make_features(prices):
    features = pd.DataFrame(index=prices.index)

    for lag in LAGS:
        features[f"lag_{lag}"] = prices.shift(lag)

    previous = prices.shift(1)

    for window in WINDOWS:
        features[f"mean_{window}"] = (
            previous.rolling(window).mean()
        )
        features[f"std_{window}"] = (
            previous.rolling(window).std()
        )

    features["momentum_7"] = (
        prices.shift(1) - prices.shift(7)
    )
    features["momentum_30"] = (
        prices.shift(1) - prices.shift(30)
    )

    features["day_of_week"] = prices.index.dayofweek
    features["month"] = prices.index.month

    features["day_of_year_sin"] = np.sin(
        2 * np.pi * prices.index.dayofyear / 365.25
    )
    features["day_of_year_cos"] = np.cos(
        2 * np.pi * prices.index.dayofyear / 365.25
    )

    return features


# --------------------------------------------------
# Generate forecasts with XGBoost
# Kept available for future retraining workflows.
# The /api/forecasts endpoint below reads the saved CSV.
# --------------------------------------------------

def generate_forecast(horizon: int):
    model = get_model()
    config = get_config()
    observed_prices = get_price_series()

    feature_columns = config["features"]

    latest_date = observed_prices.last_valid_index()
    if latest_date is None:
        raise ValueError("No valid latest observation was found.")

    history = observed_prices.loc[:latest_date].ffill().copy()
    predictions = []

    for _ in range(horizon):
        next_date = history.index[-1] + pd.Timedelta(days=1)

        extended = pd.concat([
            history,
            pd.Series(
                [np.nan],
                index=pd.DatetimeIndex([next_date]),
            ),
        ]).asfreq("D")

        features = make_features(extended)
        row = features.loc[[next_date], feature_columns]

        if row.isna().any(axis=None):
            missing = row.columns[
                row.isna().any()
            ].tolist()

            raise ValueError(
                f"Missing model features for {next_date.date()}: "
                f"{missing}"
            )

        predicted_price = max(
            0.0, float(model.predict(row)[0])
        )

        predictions.append({
            "report_date": next_date.date().isoformat(),
            "predicted_modal_price": round(predicted_price, 2),
            "unit": PRICE_UNIT,
        })

        history.loc[next_date] = predicted_price

    days_since_data = (date.today() - latest_date.date()).days

    return {
        "commodity": SUPPORTED_COMMODITY,
        "market": SUPPORTED_MARKET,
        "state": SUPPORTED_STATE,
        "unit": PRICE_UNIT,
        "horizon_days": len(predictions),
        "latest_observation_date": latest_date.date().isoformat(),
        "days_since_latest_observation": days_since_data,
        "data_is_stale": days_since_data > 14,
        "forecast": predictions,
        "disclaimer": (
            "Model estimates based on available historical data. "
            "They are not guaranteed market prices."
        ),
    }


# --------------------------------------------------
# Read the existing saved seven-day forecast CSV
# --------------------------------------------------

def read_saved_forecast(horizon: int):
    if not FORECAST_PATH.exists():
        raise FileNotFoundError(
            f"Saved forecast file not found: {FORECAST_PATH}"
        )

    df = pd.read_csv(FORECAST_PATH)

    required_columns = {
        "report_date",
        "predicted_modal_price",
    }

    if not required_columns.issubset(df.columns):
        raise ValueError(
            "The saved forecast CSV must contain "
            "'report_date' and 'predicted_modal_price' columns."
        )

    df["report_date"] = pd.to_datetime(
        df["report_date"], errors="coerce"
    )

    df["predicted_modal_price"] = pd.to_numeric(
        df["predicted_modal_price"], errors="coerce"
    )

    df = df.dropna(
        subset=["report_date", "predicted_modal_price"]
    )

    df = df[df["predicted_modal_price"] >= 0]
    df = df.sort_values("report_date")
    df = df.drop_duplicates("report_date", keep="last")
    df = df.head(horizon)

    if df.empty:
        raise ValueError(
            "The saved forecast CSV contains no valid forecast rows."
        )

    forecast_rows = []

    for _, row in df.iterrows():
        forecast_rows.append({
            "report_date": row["report_date"].date().isoformat(),
            "predicted_modal_price": round(
                float(row["predicted_modal_price"]), 2
            ),
            "unit": PRICE_UNIT,
        })

    # Use the training-data date from model_config.json to determine
    # how old the data behind this forecast is.
    latest_date = None

    try:
        config = get_config()
        configured_date = config.get("training_data_latest_date")

        if configured_date:
            parsed_date = pd.to_datetime(
                configured_date, errors="coerce"
            )

            if not pd.isna(parsed_date):
                latest_date = parsed_date.date()

    except (FileNotFoundError, ValueError, TypeError):
        latest_date = None

    # Fallback to the historical dataset if configuration has no date.
    if latest_date is None:
        try:
            prices = get_price_series()
            last_timestamp = prices.last_valid_index()

            if last_timestamp is not None:
                latest_date = last_timestamp.date()

        except (FileNotFoundError, ValueError):
            latest_date = None

    days_since_data = (
        (date.today() - latest_date).days
        if latest_date is not None
        else None
    )

    return {
        "commodity": SUPPORTED_COMMODITY,
        "market": SUPPORTED_MARKET,
        "state": SUPPORTED_STATE,
        "unit": PRICE_UNIT,
        "horizon_days": len(forecast_rows),
        "latest_observation_date": (
            latest_date.isoformat()
            if latest_date is not None
            else None
        ),
        "days_since_latest_observation": days_since_data,
        "data_is_stale": (
            days_since_data is None or days_since_data > 14
        ),
        "forecast": forecast_rows,
        "forecast_source": FORECAST_PATH.name,
        "disclaimer": (
            "These are saved model estimates, not guaranteed or "
            "current market prices. Check the forecast dates. "
            "The saved forecast may be outdated if the underlying "
            "historical data has not been refreshed."
        ),
    }


# --------------------------------------------------
# API endpoints
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "Mandi Price Intelligence API is running.",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_file_exists": MODEL_PATH.exists(),
        "config_file_exists": CONFIG_PATH.exists(),
        "historical_data_file_exists": DATA_PATH.exists(),
        "saved_forecast_file_exists": FORECAST_PATH.exists(),
    }


@app.get("/api/model/info")
def model_info():
    try:
        config = get_config()
        get_model()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return {
        "model": "XGBoost",
        "commodity": config["commodity"],
        "market": config["market"],
        "state": config["state"],
        "unit": config["unit"],
        "training_data_latest_date": config.get(
            "training_data_latest_date"
        ),
        "forecast_horizon_days": config["horizon_days"],
        "metrics": {
            "mae": config.get("final_test_mae"),
            "rmse": config.get("final_test_rmse"),
            "mape_percent": config.get("final_test_mape_percent"),
            "baseline_mae": config.get("final_test_baseline_mae"),
            "test_observations_scored": config.get(
                "test_observations_scored"
            ),
        },
        "note": (
            "Evaluation metrics are preliminary; the reported test "
            "evaluation scored only a limited number of observations."
        ),
    }


@app.get("/api/markets")
def markets(
    commodity: str = Query(default="Onion"),
    state: str = Query(default="Uttar Pradesh"),
):
    if commodity.casefold() != SUPPORTED_COMMODITY.casefold():
        raise HTTPException(
            status_code=404,
            detail="The trained model currently supports Onion only.",
        )

    if state.casefold() != SUPPORTED_STATE.casefold():
        raise HTTPException(
            status_code=404,
            detail=(
                "The trained model currently supports "
                "Uttar Pradesh only."
            ),
        )

    try:
        prices = get_price_series()
        latest_date = prices.last_valid_index()
        latest_price = float(prices.loc[latest_date])

    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return {
        "markets": [
            {
                "name": SUPPORTED_MARKET,
                "district": SUPPORTED_MARKET,
                "state": SUPPORTED_STATE,
                "commodity": SUPPORTED_COMMODITY,
                "modal_price": round(latest_price, 2),
                "price_date": latest_date.date().isoformat(),
                "unit": PRICE_UNIT,
                "model_supported": True,
            }
        ],
        "note": (
            "Only the market represented by the trained model is "
            "returned. Distance and transport costs are not available "
            "from this dataset."
        ),
    }


@app.get("/api/prices")
def historical_prices(
    commodity: str = Query(default="Onion"),
    market: str = Query(default="Sambhal"),
    limit: int = Query(default=90, ge=1, le=1740),
):
    if commodity.casefold() != SUPPORTED_COMMODITY.casefold():
        raise HTTPException(
            status_code=404,
            detail="The historical model dataset contains Onion only.",
        )

    if market.casefold() != SUPPORTED_MARKET.casefold():
        raise HTTPException(
            status_code=404,
            detail="Historical prices are available for Sambhal only.",
        )

    try:
        prices = get_price_series().dropna().tail(limit)

    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return {
        "commodity": SUPPORTED_COMMODITY,
        "market": SUPPORTED_MARKET,
        "state": SUPPORTED_STATE,
        "unit": PRICE_UNIT,
        "count": len(prices),
        "prices": [
            {
                "report_date": timestamp.date().isoformat(),
                "modal_price": round(float(price), 2),
                "unit": PRICE_UNIT,
            }
            for timestamp, price in prices.items()
        ],
    }


@app.get("/api/forecasts")
def forecasts(
    commodity: str = Query(default="Onion"),
    market: str = Query(default="Sambhal"),
    horizon: int = Query(default=7, ge=1, le=7),
):
    if commodity.casefold() != SUPPORTED_COMMODITY.casefold():
        raise HTTPException(
            status_code=404,
            detail="The trained XGBoost model supports Onion only.",
        )

    if market.casefold() != SUPPORTED_MARKET.casefold():
        raise HTTPException(
            status_code=404,
            detail="The trained XGBoost model supports Sambhal only.",
        )

    try:
        # Return the saved CSV forecast rather than generating
        # a new forecast on every API request.
        return read_saved_forecast(horizon)

    except (FileNotFoundError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/integrity/status")
def integrity_status():
    try:
        prices = get_price_series()
        latest_date = prices.last_valid_index()

    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return {
        "dataset": DATA_PATH.name,
        "valid_observations": int(prices.notna().sum()),
        "first_observation_date": (
            prices.first_valid_index().date().isoformat()
        ),
        "latest_observation_date": latest_date.date().isoformat(),
        "missing_calendar_days": int(prices.isna().sum()),
        "positive_prices_only": bool((prices.dropna() > 0).all()),
        "note": (
            "This endpoint reports basic data checks; it does not "
            "claim a percentage integrity score or cryptographic "
            "verification."
        ),
    }
