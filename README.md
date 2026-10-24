# Mandi Price Intelligence UI

A responsive React + TypeScript dashboard prototype for the Mandi Price Intelligence project.

## Important
The prices, forecasts, data integrity percentage, market updates, and mandi records in this starter UI are illustrative demo values. They are not live market data and must not be used for selling decisions. Connect the frontend to a verified data source and validated forecasting API before deployment for real users.

## Requirements
- Node.js 18 or later
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## Production build
```bash
npm run build
npm run preview
```

## Main files
- `src/App.tsx`: UI components, demo data, filtering, crop selection, quantity calculator, CSV export, chart.
- `src/styles.css`: colors, spacing, layout, responsive styles, and component styling.
- `src/main.tsx`: React entry point.
- `package.json`: scripts and dependencies.

## Connect a real FastAPI backend
Replace the demo arrays in `src/App.tsx` with API calls to your backend. A suggested API shape:

- `GET /api/markets?commodity=Onion&state=Maharashtra`
- `GET /api/prices?commodity=Onion&market=Lasalgaon%20APMC`
- `GET /api/forecasts?commodity=Onion&market=Lasalgaon%20APMC&horizon=7`
- `GET /api/integrity/status`

Use a configurable environment variable such as `VITE_API_BASE_URL` for the backend base URL. Do not place secret API keys in frontend environment variables.

## Suggested backend response fields
Market:
```json
{
  "name": "Lasalgaon APMC",
  "district": "Nashik",
  "modal_price": 2400,
  "price_date": "2026-10-23",
  "distance_km": 42,
  "transport_cost_per_quintal": 90
}
```

Forecast:
```json
{
  "commodity": "Onion",
  "market": "Lasalgaon APMC",
  "horizon_days": 7,
  "predicted_price": 2520,
  "lower_bound": 2340,
  "upper_bound": 2700,
  "model_version": "baseline-v1"
}
```

## Features in this prototype
- Responsive sidebar and mobile navigation
- Crop selection
- Historical/forecast line chart
- Forecast horizon selector
- Mandi search and district filter
- Quantity-based estimated return calculation
- Estimated net price after transport
- CSV export
- Demo data and integrity disclaimers
