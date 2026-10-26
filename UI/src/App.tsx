
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Download,
  Fingerprint,
  LayoutDashboard,
  Leaf,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sprout,
  TrendingUp,
  Wheat,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getForecast,
  getHealth,
  getIntegrity,
  getModelInfo,
  getPrices,
  type ForecastPoint,
  type PricePoint,
} from "./services/api";

const money = (value: number) =>
  `₹${Math.round(value).toLocaleString("en-IN")}`;

const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

type ChartPoint = {
  day: string;
  actual?: number;
  forecast?: number;
};

export default function App() {
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [forecasts, setForecasts] = useState<ForecastPoint[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [modelInfo, setModelInfo] = useState<Record<string, unknown> | null>(
    null
  );
  const [integrity, setIntegrity] =
    useState<Record<string, unknown> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forecastStale, setForecastStale] = useState(false);
  const [latestHistoricalDate, setLatestHistoricalDate] = useState<
    string | null
  >(null);

  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("7 days");
  const [quantity, setQuantity] = useState(20);
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const [historyResult, forecastResult, healthResult, modelResult, integrityResult] =
        await Promise.all([
          getPrices(365),
          getForecast(7),
          getHealth(),
          getModelInfo(),
          getIntegrity(),
        ]);

      const sortedPrices = [...historyResult].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      const sortedForecasts = [...forecastResult.points].sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      setPrices(sortedPrices);
      setForecasts(sortedForecasts);
      setHealth(healthResult);
      setModelInfo(modelResult);
      setIntegrity(integrityResult);
      setLatestHistoricalDate(
        forecastResult.latestHistoricalDate ||
          sortedPrices.at(-1)?.date ||
          null
      );

      const lastDate =
        forecastResult.latestHistoricalDate ||
        sortedPrices.at(-1)?.date ||
        null;

      const daysOld = lastDate
        ? (Date.now() - new Date(`${lastDate}T00:00:00`).getTime()) /
          (1000 * 60 * 60 * 24)
        : Infinity;

      setForecastStale(forecastResult.stale || daysOld > 14);

      if (sortedPrices.length === 0) {
        setError(
          "The API connected, but no historical prices were returned. Check the backend dataset and API response."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const latestPrice = prices.at(-1);
  const previousPrice = prices.length > 1 ? prices.at(-2) : undefined;

  const priceChange =
    latestPrice && previousPrice && previousPrice.price !== 0
      ? ((latestPrice.price - previousPrice.price) / previousPrice.price) * 100
      : null;

  const forecastPrice = forecasts.at(-1)?.price;
  const forecastChange =
    latestPrice && forecastPrice && latestPrice.price !== 0
      ? ((forecastPrice - latestPrice.price) / latestPrice.price) * 100
      : null;

  const filteredPrices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return prices;
    return prices.filter(
      (point) =>
        point.date.toLowerCase().includes(query) ||
        dateLabel(point.date).toLowerCase().includes(query)
    );
  }, [prices, search]);

  const chartData: ChartPoint[] = useMemo(() => {
    const merged = new Map<string, ChartPoint>();

    prices.forEach((point) => {
      merged.set(point.date, {
        day: dateLabel(point.date),
        actual: point.price,
      });
    });

    forecasts.forEach((point) => {
      const existing = merged.get(point.date) ?? {
        day: dateLabel(point.date),
      };
      merged.set(point.date, { ...existing, forecast: point.price });
    });

    // Join the forecast line to the last observed price.
    if (latestPrice && forecasts.length > 0) {
      const latest = merged.get(latestPrice.date);
      if (latest) {
        merged.set(latestPrice.date, {
          ...latest,
          forecast: latestPrice.price,
        });
      }
    }

    return [...merged.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-90)
      .map(([, point]) => point);
  }, [prices, forecasts, latestPrice]);

  function exportCsv() {
    const rows = [
      ["Date", "Historical modal price (₹/quintal)", "Forecast (₹/quintal)"],
      ...chartData.map((point) => [
        point.day,
        point.actual?.toString() ?? "",
        point.forecast?.toString() ?? "",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")
      )
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sambhal-onion-prices-and-forecast.csv";
    link.click();
    URL.revokeObjectURL(url);
    setToast("Price history and forecast exported");
  }

  const modelName =
    modelInfo?.model_name ??
    modelInfo?.model ??
    modelInfo?.algorithm ??
    "XGBoost";

  const apiOnline = health !== null;
  const integritySummary =
    integrity?.status ?? integrity?.message ?? integrity?.integrity_status;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Sprout size={23} /></div>
          <div>
            <strong>Mandi<span>Mitr</span></strong>
            <small>PRICE INTELLIGENCE</small>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          {[
            { label: "Overview", icon: LayoutDashboard },
            { label: "Price Explorer", icon: TrendingUp },
            { label: "Mandi Comparison", icon: MapPin },
            { label: "AI Forecasts", icon: Activity },
            { label: "Data Integrity", icon: ShieldCheck },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activeNav === label ? "active" : ""}`}
              onClick={() => {
                setActiveNav(label);
                setMobileMenu(false);
                document
                  .getElementById(
                    label === "AI Forecasts"
                      ? "forecast-section"
                      : label === "Data Integrity"
                        ? "integrity-section"
                        : label === "Mandi Comparison"
                          ? "mandi-section"
                          : "overview-section"
                  )
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "AI Forecasts" && <span className="nav-pill">AI</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="integrity-card">
            <div className="integrity-icon"><Fingerprint size={18} /></div>
            <div>
              <strong>Backend status</strong>
              <span>
                <i className="status-dot" />
                {loading ? "Connecting..." : apiOnline ? "API connected" : "Offline"}
              </span>
            </div>
          </div>
          <div className="profile">
            <div className="avatar">FM</div>
            <div className="profile-text">
              <strong>Farmer workspace</strong>
              <span>Sambhal, Uttar Pradesh</span>
            </div>
            <ChevronDown size={16} className="muted-icon" />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            onClick={() => setMobileMenu(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span><span className="slash">/</span><strong>{activeNav}</strong>
          </div>
          <div className="top-actions">
            <div className="data-status">
              <span className="status-dot" />
              {loading ? "Loading data" : apiOnline ? "API connected" : "API offline"}
              <span className="status-divider" />
              {latestHistoricalDate ? `Data through ${latestHistoricalDate}` : "No data date"}
            </div>
            <button
              className="icon-button help-button"
              onClick={() => setShowHelp(!showHelp)}
              aria-label="Help"
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-button notification-button"
              onClick={() =>
                setToast(
                  forecastStale
                    ? "Warning: forecast data is outdated."
                    : "No new notifications."
                )
              }
              aria-label="Notifications"
            >
              <Bell size={19} />
              <i />
            </button>
          </div>
        </header>

        {showHelp && (
          <div className="help-popover">
            <strong>About this dashboard</strong>
            <p>
              Prices and forecasts are loaded from the FastAPI backend. Forecasts
              are estimates and may be outdated when the underlying historical
              dataset has not been refreshed.
            </p>
            <button onClick={() => setShowHelp(false)}>Got it</button>
          </div>
        )}

        <div className="page-content" id="overview-section">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><Leaf size={14} /> AGRICULTURE MARKET INTELLIGENCE</div>
              <h1>Market overview<span className="heading-period">.</span></h1>
              <p className="page-subtitle">
                Historical onion prices and model forecasts for Sambhal, Uttar Pradesh.
              </p>
            </div>
            <div className="welcome-actions">
              <label className="crop-select-wrap">
                <span>Crop</span>
                <select value="Onion" disabled aria-label="Selected crop">
                  <option>Onion</option>
                </select>
                <ChevronDown size={15} />
              </label>
              <button className="primary-button" onClick={exportCsv} disabled={chartData.length === 0}>
                <Download size={16} /> Export data
              </button>
            </div>
          </section>

          <section className="market-banner">
            <div className="banner-copy">
              <div className="banner-kicker">
                <span className="live-dot" /> MODEL MARKET SNAPSHOT
                <span className="banner-date">
                  {latestHistoricalDate ? ` • ${dateLabel(latestHistoricalDate)}` : ""}
                </span>
              </div>
              <h2>Know your market.<br /><em>Plan your next move.</em></h2>
              <p>
                Review historical mandi prices and seven-day model forecasts.
                Always check the data date before relying on a prediction.
              </p>
              <button
                className="banner-button"
                onClick={() =>
                  document.getElementById("forecast-section")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                View forecast <ArrowRight size={16} />
              </button>
            </div>
            <div className="banner-art" aria-hidden="true">
              <div className="sun-disc" />
              <div className="hill hill-back" />
              <div className="hill hill-front" />
              <div className="field-lines"><span /><span /><span /><span /></div>
              <div className="plant plant-one"><i /><b /><em /></div>
              <div className="plant plant-two"><i /><b /><em /></div>
              <div className="price-chip">
                <TrendingUp size={16} />
                <span>Model insights</span>
                <strong>{String(modelName)}</strong>
              </div>
            </div>
          </section>

          {error && (
            <div role="alert" className="forecast-note">
              <span className="note-icon"><CircleHelp size={16} /></span>
              <div>
                <strong>{loading ? "Loading dashboard" : "Dashboard data issue"}</strong>
                <span>{error}</span>
                <button className="banner-button" onClick={() => void loadDashboard()}>
                  Retry <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {forecastStale && (
            <div role="status" className="forecast-note">
              <span className="note-icon"><CalendarDays size={16} /></span>
              <div>
                <strong>Forecast data is outdated</strong>
                <span>
                  {latestHistoricalDate
                    ? `The latest historical price date is ${dateLabel(latestHistoricalDate)}.`
                    : "The underlying price history is old or its date could not be confirmed."}{" "}
                  Treat the forecast as a historical model output, not today's market price.
                </span>
              </div>
            </div>
          )}

          <section className="section-heading">
            <div>
              <h2>Market at a glance</h2>
              <p>Latest available records from the backend dataset</p>
            </div>
            <span className="source-tag"><Database size={13} /> Backend data</span>
          </section>

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Latest historical price</span>
                <span className="stat-icon green"><Wheat size={18} /></span>
              </div>
              <div className="stat-value">
                {latestPrice ? money(latestPrice.price) : "—"}<small>/qtl</small>
              </div>
              <div className={`stat-foot ${(priceChange ?? 0) >= 0 ? "positive" : "negative"}`}>
                {(priceChange ?? 0) >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {priceChange === null ? "—" : `${Math.abs(priceChange).toFixed(2)}%`}
                <span>vs previous record</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Last forecast ({period})</span>
                <span className="stat-icon blue"><Activity size={18} /></span>
              </div>
              <div className="stat-value">
                {forecastPrice !== undefined ? money(forecastPrice) : "—"}<small>/qtl</small>
              </div>
              <div className={`stat-foot ${(forecastChange ?? 0) >= 0 ? "positive" : "negative"}`}>
                {(forecastChange ?? 0) >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {forecastChange === null ? "—" : `${Math.abs(forecastChange).toFixed(2)}%`}
                <span>vs latest history</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Market tracked</span>
                <span className="stat-icon amber"><MapPin size={18} /></span>
              </div>
              <div className="stat-value">1<small> market</small></div>
              <div className="stat-foot neutral"><Check size={15} /><span>Sambhal, Uttar Pradesh</span></div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Model status</span>
                <span className="stat-icon violet"><Fingerprint size={18} /></span>
              </div>
              <div className="stat-value">{loading ? "…" : apiOnline ? "Online" : "Offline"}</div>
              <div className="stat-foot neutral">
                <ShieldCheck size={15} />
                <span>{String(modelName)}</span>
              </div>
            </article>
          </section>

          <section className="content-grid" id="forecast-section">
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h3>Historical price & forecast</h3>
                  <p>Daily prices returned by the backend</p>
                </div>
                <label className="period-select">
                  <CalendarDays size={15} />
                  <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Forecast period">
                    <option>7 days</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
              </div>
              <div className="chart-legend">
                <span><i className="legend-dot actual-dot" /> Historical price</span>
                <span><i className="legend-line" /> Model forecast</span>
                <span className="uncertainty-label">{forecastStale ? "Outdated" : "API data"}</span>
              </div>
              <div className="chart-wrap">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2e8155" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#2e8155" stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#5b8def" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#5b8def" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e9eee9" strokeDasharray="3 5" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#87928a" }} axisLine={false} tickLine={false} dy={9} minTickGap={24} />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11, fill: "#87928a" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `₹${(value / 1000).toFixed(1)}k`}
                      />
                      <Tooltip
                        formatter={(value) =>
                          value === undefined || value === null
                            ? ["—", "Price"]
                            : [`${money(Number(value))}/qtl`, "Price"]
                        }
                        contentStyle={{ borderRadius: 12, border: "1px solid #e2e9e2", fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="actual" name="Historical" stroke="#2e8155" strokeWidth={2.5} fill="url(#actualFill)" connectNulls={false} dot={false} />
                      <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#4e80dd" strokeWidth={2.5} strokeDasharray="5 4" fill="url(#forecastFill)" connectNulls={false} dot={{ r: 3, fill: "#4e80dd", strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">{loading ? "Loading chart data…" : "No chart data available."}</div>
                )}
              </div>
              <div className="forecast-note">
                <span className="note-icon"><Activity size={16} /></span>
                <div>
                  <strong>Forecast is an estimate, not a guarantee.</strong>
                  <span>
                    {forecasts.length > 0
                      ? `Forecast dates: ${dateLabel(forecasts[0].date)} – ${dateLabel(forecasts[forecasts.length - 1].date)}.`
                      : "No forecast points were returned by the backend."}
                    {forecastStale ? " This forecast is stale." : ""}
                  </span>
                </div>
              </div>
            </article>

            <article className="panel insight-panel">
              <div className="panel-heading">
                <div><h3>AI market insight</h3><p>Based on the connected model output</p></div>
                <span className="ai-mark">AI</span>
              </div>
              <div className="insight-hero">
                <div className="insight-trend"><TrendingUp size={19} /><span>Seven-day model forecast</span></div>
                <div className="insight-price">
                  {forecastPrice !== undefined ? money(forecastPrice) : "—"}
                  <span>/quintal</span>
                </div>
                <p>Last value returned by the XGBoost forecast endpoint.</p>
              </div>
              <div className="insight-detail"><span>Commodity</span><strong>Onion</strong></div>
              <div className="insight-detail"><span>Market</span><strong>Sambhal, UP</strong></div>
              <div className="insight-detail"><span>Model</span><strong>{String(modelName)}</strong></div>
              <div className="insight-detail">
                <span>Forecast status</span>
                <span className="status-badge"><i />{forecastStale ? "Outdated" : forecasts.length ? "Available" : "Unavailable"}</span>
              </div>
              <div className="insight-disclaimer">
                <CircleHelp size={15} />
                <span>Check the source date and local market conditions before making selling decisions.</span>
              </div>
            </article>
          </section>

          <section className="panel mandi-panel" id="mandi-section">
            <div className="panel-heading mandi-heading">
              <div>
                <h3>Historical price records</h3>
                <p>Search actual observations from the connected Sambhal dataset.</p>
              </div>
              <div className="table-actions">
                <label className="search-box">
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search date..."
                    aria-label="Search historical date"
                  />
                </label>
              </div>
            </div>
            <div className="quantity-row">
              <div>
                <span className="quantity-label">Reference quantity</span>
                <span className="quantity-sub">Used to calculate gross value, not transport or profit</span>
              </div>
              <div className="quantity-control">
                <button onClick={() => setQuantity(Math.max(1, quantity - 5))} aria-label="Decrease quantity">−</button>
                <strong>{quantity} <small>qtl</small></strong>
                <button onClick={() => setQuantity(quantity + 5)} aria-label="Increase quantity">+</button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>COMMODITY</th>
                    <th>MARKET</th>
                    <th>MODAL PRICE <span>₹/qtl</span></th>
                    <th>GROSS VALUE <span>{quantity} qtl</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[...filteredPrices].reverse().slice(0, 50).map((point) => (
                    <tr key={point.date}>
                      <td><strong>{dateLabel(point.date)}</strong></td>
                      <td>Onion</td>
                      <td>Sambhal, Uttar Pradesh</td>
                      <td><strong className="price-cell">{money(point.price)}</strong></td>
                      <td><strong>{money(point.price * quantity)}</strong></td>
                    </tr>
                  ))}
                  {filteredPrices.length === 0 && (
                    <tr><td colSpan={5} className="empty-state">
                      {loading ? "Loading price records…" : "No records match your search."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                Showing <strong>{Math.min(filteredPrices.length, 50)}</strong> of{" "}
                <strong>{filteredPrices.length}</strong> matching records
              </span>
              <span className="footer-explain">
                <Database size={14} /> Historical backend data
              </span>
            </div>
          </section>

          <section className="bottom-grid" id="integrity-section">
            <article className="panel integrity-panel">
              <div className="mini-panel-icon"><Fingerprint size={19} /></div>
              <div className="mini-panel-copy">
                <h3>Data integrity</h3>
                <p>
                  {integritySummary
                    ? String(integritySummary)
                    : "Integrity details are supplied by the backend when available."}
                </p>
                <span className="mini-link"><ShieldCheck size={14} /> API integrity endpoint</span>
              </div>
            </article>
            <article className="panel weather-panel">
              <div className="weather-icon"><Database size={24} /></div>
              <div className="mini-panel-copy">
                <h3>Data coverage</h3>
                <p>
                  {prices.length} historical price records loaded for Onion in Sambhal.
                  {latestHistoricalDate ? ` Latest date: ${dateLabel(latestHistoricalDate)}.` : ""}
                </p>
                <span className="mini-link"><Activity size={14} /> Connected to FastAPI</span>
              </div>
            </article>
          </section>

          <footer className="footer">
            <span>© 2026 MandiMitr · Academic project prototype</span>
            <span><i className="status-dot" /> Historical data and model estimates · Not financial advice</span>
          </footer>
        </div>
      </main>

      {mobileMenu && (
        <button
          className="mobile-overlay"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation overlay"
        />
      )}

      {toast && (
        <div className="toast">
          <Check size={16} />{toast}
          <button onClick={() => setToast("")} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
