
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export type PricePoint = {
  date: string;
  price: number;
};

export type ForecastPoint = {
  date: string;
  price: number;
};

export type ForecastResponse = {
  points: ForecastPoint[];
  stale: boolean;
  latestHistoricalDate: string | null;
  message: string | null;
  raw: Record<string, unknown>;
};

async function request<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch {
    throw new Error(
      "Cannot connect to the backend. Make sure the FastAPI server is running."
    );
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `API error (${response.status}): ${detail || response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function findArray(
  response: unknown,
  keys: string[]
): Record<string, unknown>[] {
  if (Array.isArray(response)) {
    return response.map(asObject);
  }

  const object = asObject(response);

  for (const key of keys) {
    if (Array.isArray(object[key])) {
      return (object[key] as unknown[]).map(asObject);
    }
  }

  return [];
}

function firstValue(
  object: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }

  return undefined;
}

function toPrice(value: unknown): number | null {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

function toDate(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  const text = String(value);
  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? text
    : date.toISOString().slice(0, 10);
}

export async function getHealth(): Promise<Record<string, unknown>> {
  return request("/api/health");
}

export async function getPrices(limit = 365): Promise<PricePoint[]> {
  const response = await request<unknown>(
    `/api/prices?commodity=Onion&market=Sambhal&limit=${limit}`
  );

  return findArray(response, [
    "prices",
    "history",
    "data",
    "items",
    "records",
  ])
    .map((row) => ({
      date: toDate(
        firstValue(row, [
          "date",
          "report_date",
          "arrival_date",
          "day",
        ])
      ),
      price: toPrice(
        firstValue(row, [
          "modal_price",
          "price",
          "modalPrice",
          "value",
        ])
      ),
    }))
    .filter(
      (row): row is { date: string; price: number } =>
        Boolean(row.date) && row.price !== null
    );
}

export async function getForecast(
  horizon = 7
): Promise<ForecastResponse> {
  const response = await request<unknown>(
    `/api/forecasts?commodity=Onion&market=Sambhal&horizon=${horizon}`
  );

  const object = asObject(response);

  // The backend returns "forecast", with rows containing
  // "report_date" and "predicted_modal_price".
  const rows = findArray(response, [
    "forecast",
    "forecasts",
    "predictions",
    "data",
    "items",
    "results",
  ]);

  const points: ForecastPoint[] = rows
    .map((row) => {
      const date = toDate(
        firstValue(row, [
          "report_date",
          "date",
          "forecast_date",
          "target_date",
          "day",
        ])
      );

      const price = toPrice(
        firstValue(row, [
          "predicted_modal_price",
          "predicted_price",
          "forecast_price",
          "modal_price",
          "prediction",
          "price",
          "yhat",
        ])
      );

      return { date, price };
    })
    .filter(
      (row): row is { date: string; price: number } =>
        Boolean(row.date) && row.price !== null
    );

  const staleValue = firstValue(object, [
    "data_is_stale",
    "stale",
    "is_stale",
    "forecast_stale",
  ]);

  const stale =
    staleValue === true ||
    staleValue === "true" ||
    staleValue === 1;

  const latestHistoricalDate = firstValue(object, [
    "latest_observation_date",
    "latest_historical_date",
    "latest_date",
    "data_through",
    "last_observed_date",
  ]);

  const message = firstValue(object, [
    "disclaimer",
    "message",
    "warning",
    "status_message",
  ]);

  return {
    points,
    stale,
    latestHistoricalDate: latestHistoricalDate
      ? toDate(latestHistoricalDate)
      : null,
    message: message ? String(message) : null,
    raw: object,
  };
}

export async function getModelInfo(): Promise<Record<string, unknown>> {
  return request("/api/model/info");
}

export async function getIntegrity(): Promise<Record<string, unknown>> {
  return request("/api/integrity/status");
}
