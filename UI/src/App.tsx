import { useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Check, ChevronDown, CircleHelp, CloudSun, Database, Download, Fingerprint,
  LayoutDashboard, Leaf, MapPin, Menu, Search, ShieldCheck, Sprout, TrendingUp,
  Wheat, X
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

type Crop = "Onion" | "Soybean" | "Tomato";
type Mandi = { name: string; district: string; price: number; change: number; distance: number; transport: number; updated: string };

const cropInfo: Record<Crop, { unit: string; price: number; change: number; icon: string; forecast: number; confidence: string }> = {
  Onion: { unit: "₹/quintal", price: 2400, change: 3.2, icon: "🧅", forecast: 2520, confidence: "± ₹180" },
  Soybean: { unit: "₹/quintal", price: 4680, change: -0.8, icon: "🌱", forecast: 4750, confidence: "± ₹220" },
  Tomato: { unit: "₹/quintal", price: 3200, change: 5.4, icon: "🍅", forecast: 3380, confidence: "± ₹260" }
};

const mandiData: Record<Crop, Mandi[]> = {
  Onion: [
    { name: "Lasalgaon APMC", district: "Nashik, Maharashtra", price: 2400, change: 3.2, distance: 42, transport: 90, updated: "Today, 10:30 AM" },
    { name: "Pimpalgaon Baswant", district: "Nashik, Maharashtra", price: 2550, change: 4.1, distance: 58, transport: 125, updated: "Today, 9:45 AM" },
    { name: "Pune Market Yard", district: "Pune, Maharashtra", price: 2480, change: 1.6, distance: 188, transport: 360, updated: "Today, 11:00 AM" },
    { name: "Ahmednagar APMC", district: "Ahilyanagar, Maharashtra", price: 2320, change: -1.2, distance: 126, transport: 245, updated: "Yesterday, 4:15 PM" }
  ],
  Soybean: [
    { name: "Latur APMC", district: "Latur, Maharashtra", price: 4680, change: -0.8, distance: 36, transport: 80, updated: "Today, 10:10 AM" },
    { name: "Akola APMC", district: "Akola, Maharashtra", price: 4770, change: 1.4, distance: 112, transport: 225, updated: "Today, 9:30 AM" },
    { name: "Amravati APMC", district: "Amravati, Maharashtra", price: 4610, change: -0.4, distance: 94, transport: 185, updated: "Today, 10:00 AM" },
    { name: "Washim APMC", district: "Washim, Maharashtra", price: 4720, change: 0.7, distance: 76, transport: 150, updated: "Yesterday, 3:50 PM" }
  ],
  Tomato: [
    { name: "Pune Market Yard", district: "Pune, Maharashtra", price: 3200, change: 5.4, distance: 28, transport: 65, updated: "Today, 11:00 AM" },
    { name: "Nashik APMC", district: "Nashik, Maharashtra", price: 3340, change: 6.1, distance: 172, transport: 330, updated: "Today, 9:40 AM" },
    { name: "Sangamner APMC", district: "Ahilyanagar, Maharashtra", price: 3150, change: 2.0, distance: 74, transport: 145, updated: "Today, 10:20 AM" },
    { name: "Satara APMC", district: "Satara, Maharashtra", price: 3090, change: -1.0, distance: 112, transport: 220, updated: "Yesterday, 4:00 PM" }
  ]
};

const history: Record<Crop, { day: string; actual: number; forecast?: number }[]> = {
  Onion: [
    { day: "12 Oct", actual: 2180 }, { day: "14 Oct", actual: 2250 }, { day: "16 Oct", actual: 2200 },
    { day: "18 Oct", actual: 2310 }, { day: "20 Oct", actual: 2350 }, { day: "22 Oct", actual: 2400 },
    { day: "24 Oct", actual: 2440, forecast: 2440 }, { day: "26 Oct", actual: 0, forecast: 2470 },
    { day: "28 Oct", actual: 0, forecast: 2500 }, { day: "30 Oct", actual: 0, forecast: 2520 }
  ],
  Soybean: [
    { day: "12 Oct", actual: 4590 }, { day: "14 Oct", actual: 4650 }, { day: "16 Oct", actual: 4610 },
    { day: "18 Oct", actual: 4690 }, { day: "20 Oct", actual: 4660 }, { day: "22 Oct", actual: 4680 },
    { day: "24 Oct", actual: 0, forecast: 4690 }, { day: "26 Oct", actual: 0, forecast: 4710 },
    { day: "28 Oct", actual: 0, forecast: 4730 }, { day: "30 Oct", actual: 0, forecast: 4750 }
  ],
  Tomato: [
    { day: "12 Oct", actual: 2920 }, { day: "14 Oct", actual: 3010 }, { day: "16 Oct", actual: 2980 },
    { day: "18 Oct", actual: 3090 }, { day: "20 Oct", actual: 3150 }, { day: "22 Oct", actual: 3200 },
    { day: "24 Oct", actual: 0, forecast: 3250 }, { day: "26 Oct", actual: 0, forecast: 3290 },
    { day: "28 Oct", actual: 0, forecast: 3340 }, { day: "30 Oct", actual: 0, forecast: 3380 }
  ]
};

const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
const fmt = (value: number) => value.toLocaleString("en-IN");

export default function App() {
  const [crop, setCrop] = useState<Crop>("Onion");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("7 days");
  const [quantity, setQuantity] = useState(20);
  const [district, setDistrict] = useState("All districts");
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState("");

  const info = cropInfo[crop];
  const mandis = useMemo(() => mandiData[crop].filter(m =>
    `${m.name} ${m.district}`.toLowerCase().includes(search.toLowerCase()) &&
    (district === "All districts" || m.district.includes(district))
  ).map(m => ({ ...m, net: m.price - m.transport })), [crop, search, district]);

  const bestMandi = [...mandis].sort((a, b) => b.net - a.net)[0];
  const forecastData = history[crop].map((point, index, arr) => ({
    ...point,
    actual: point.actual || undefined,
    forecast: index < 5 ? undefined : point.forecast ?? (index === 5 ? point.actual : undefined),
    bandUpper: point.forecast ? point.forecast + (crop === "Onion" ? 180 : 220) : undefined,
    bandLower: point.forecast ? point.forecast - (crop === "Onion" ? 180 : 220) : undefined
  }));

  function exportCsv() {
    const rows = [["Mandi", "District", "Modal price (INR/quintal)", "Change (%)", "Distance (km)", "Transport estimate", "Net estimate"]];
    mandis.forEach(m => rows.push([m.name, m.district, String(m.price), String(m.change), String(m.distance), String(m.transport), String(m.net)]));
    const csv = rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${crop.toLowerCase()}-mandi-comparison.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("Mandi comparison CSV exported");
    window.setTimeout(() => setToast(""), 2500);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Sprout size={23} /></div>
          <div><strong>Mandi<span>Mit r</span></strong><small>PRICE INTELLIGENCE</small></div>
          <button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18}/></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          {[
            { label: "Overview", icon: LayoutDashboard },
            { label: "Price Explorer", icon: TrendingUp },
            { label: "Mandi Comparison", icon: MapPin },
            { label: "AI Forecasts", icon: Activity },
            { label: "Data Integrity", icon: ShieldCheck }
          ].map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => { setActiveNav(label); setMobileMenu(false); }}>
              <Icon size={18}/><span>{label}</span>{label === "AI Forecasts" && <span className="nav-pill">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="integrity-card">
            <div className="integrity-icon"><Fingerprint size={18}/></div>
            <div><strong>Data integrity</strong><span><i className="status-dot"/> Hash checks enabled</span></div>
          </div>
          <div className="profile">
            <div className="avatar">FM</div>
            <div className="profile-text"><strong>Farmer workspace</strong><span>Maharashtra, India</span></div>
            <ChevronDown size={16} className="muted-icon"/>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-toggle" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20}/></button>
          <div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{activeNav}</strong></div>
          <div className="top-actions">
            <div className="data-status"><span className="status-dot"/> Demo data <span className="status-divider"/> Updated just now</div>
            <button className="icon-button help-button" onClick={() => setShowHelp(!showHelp)} aria-label="Help"><CircleHelp size={19}/></button>
            <button className="icon-button notification-button" onClick={() => setToast("Notifications will be available after backend integration")} aria-label="Notifications"><Bell size={19}/><i/></button>
          </div>
        </header>

        {showHelp && <div className="help-popover"><strong>About this dashboard</strong><p>This prototype uses illustrative sample values. Connect official mandi data and a validated forecasting API before using it for real decisions.</p><button onClick={() => setShowHelp(false)}>Got it</button></div>}

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><Leaf size={14}/> AGRICULTURE MARKET INTELLIGENCE</div>
              <h1>Market overview<span className="heading-period">.</span></h1>
              <p className="page-subtitle">Make more informed selling decisions with transparent market data.</p>
            </div>
            <div className="welcome-actions">
              <label className="crop-select-wrap"><span>Crop</span><select value={crop} onChange={e => setCrop(e.target.value as Crop)} aria-label="Select crop">{Object.keys(cropInfo).map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={15}/></label>
              <button className="primary-button" onClick={exportCsv}><Download size={16}/> Export data</button>
            </div>
          </section>

          <section className="market-banner">
            <div className="banner-copy">
              <div className="banner-kicker"><span className="live-dot"/> MARKET SNAPSHOT <span className="banner-date">• 23 October 2026</span></div>
              <h2>Know your market.<br/><em>Plan your next move.</em></h2>
              <p>Explore reported mandi prices, review forecast signals, and compare estimated returns before choosing a market.</p>
              <button className="banner-button" onClick={() => { setActiveNav("Mandi Comparison"); document.getElementById("mandi-section")?.scrollIntoView({ behavior: "smooth" }); }}>Compare mandis <ArrowRight size={16}/></button>
            </div>
            <div className="banner-art" aria-hidden="true">
              <div className="sun-disc"/><div className="hill hill-back"/><div className="hill hill-front"/>
              <div className="field-lines"><span/><span/><span/><span/></div>
              <div className="plant plant-one"><i/><b/><em/></div><div className="plant plant-two"><i/><b/><em/></div>
              <div className="price-chip"><TrendingUp size={16}/><span>Market insights</span><strong>Data-led decisions</strong></div>
            </div>
          </section>

          <section className="section-heading">
            <div><h2>Market at a glance</h2><p>Latest available snapshot for {crop.toLowerCase()}</p></div>
            <span className="source-tag"><Database size={13}/> Illustrative data</span>
          </section>

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top"><span className="stat-label">Current modal price</span><span className="stat-icon green"><Wheat size={18}/></span></div>
              <div className="stat-value">{money(info.price)}<small>/qtl</small></div>
              <div className={`stat-foot ${info.change >= 0 ? "positive" : "negative"}`}>{info.change >= 0 ? <ArrowUpRight size={15}/> : <ArrowDownRight size={15}/>} {Math.abs(info.change).toFixed(1)}% <span>vs previous period</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-label">Forecast ({period})</span><span className="stat-icon blue"><Activity size={18}/></span></div>
              <div className="stat-value">{money(info.forecast)}<small>/qtl</small></div>
              <div className="stat-foot positive"><ArrowUpRight size={15}/> {((info.forecast / info.price - 1) * 100).toFixed(1)}% <span>estimated movement</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-label">Markets tracked</span><span className="stat-icon amber"><MapPin size={18}/></span></div>
              <div className="stat-value">{mandiData[crop].length}<small> mandis</small></div>
              <div className="stat-foot neutral"><Check size={15}/> <span>Across Maharashtra (demo)</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-label">Data integrity</span><span className="stat-icon violet"><Fingerprint size={18}/></span></div>
              <div className="stat-value">98.6<small>%</small></div>
              <div className="stat-foot positive"><ShieldCheck size={15}/> <span>Demo validation score</span></div>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div><h3>Price trend & forecast</h3><p>Historical modal price with a sample forecast</p></div>
                <label className="period-select"><CalendarDays size={15}/><select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Forecast period"><option>7 days</option><option>15 days</option><option>30 days</option></select><ChevronDown size={14}/></label>
              </div>
              <div className="chart-legend"><span><i className="legend-dot actual-dot"/> Historical price</span><span><i className="legend-line"/> Forecast estimate</span><span className="uncertainty-label">Illustrative</span></div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastData} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2e8155" stopOpacity={0.18}/><stop offset="100%" stopColor="#2e8155" stopOpacity={0.01}/></linearGradient>
                      <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b8def" stopOpacity={0.15}/><stop offset="100%" stopColor="#5b8def" stopOpacity={0.01}/></linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e9eee9" strokeDasharray="3 5" vertical={false}/>
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#87928a" }} axisLine={false} tickLine={false} dy={9}/>
                    <YAxis domain={["dataMin - 250", "dataMax + 250"]} tick={{ fontSize: 11, fill: "#87928a" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(1)}k`} />
                    <Tooltip formatter={(value) => value ? [`₹${Number(value).toLocaleString("en-IN")}/qtl`, "Price"] : ["—", ""]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e9e2", fontSize: 12 }}/>
                    <Area type="monotone" dataKey="actual" stroke="#2e8155" strokeWidth={2.5} fill="url(#actualFill)" connectNulls={false} dot={{ r: 3, fill: "#2e8155", strokeWidth: 0 }}/>
                    <Area type="monotone" dataKey="forecast" stroke="#4e80dd" strokeWidth={2.5} strokeDasharray="5 4" fill="url(#forecastFill)" connectNulls={false} dot={{ r: 3, fill: "#4e80dd", strokeWidth: 0 }}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="forecast-note"><span className="note-icon"><Activity size={16}/></span><div><strong>Forecast is an estimate, not a guarantee.</strong><span>Indicative range: {money(info.forecast - Number(info.confidence.replace(/[^\d]/g, "")))} – {money(info.forecast + Number(info.confidence.replace(/[^\d]/g, "")))} per quintal. Replace sample output with validated model results.</span></div></div>
            </article>

            <article className="panel insight-panel">
              <div className="panel-heading"><div><h3>AI market insight</h3><p>Summary of the sample forecast</p></div><span className="ai-mark">AI</span></div>
              <div className="insight-hero">
                <div className="insight-trend"><TrendingUp size={19}/><span>Potential upward trend</span></div>
                <div className="insight-price">{money(info.forecast)}<span>/quintal</span></div>
                <p>Indicative price estimate for the selected crop and horizon.</p>
              </div>
              <div className="insight-detail"><span>Forecast horizon</span><strong>{period}</strong></div>
              <div className="insight-detail"><span>Illustrative uncertainty</span><strong>{info.confidence}</strong></div>
              <div className="insight-detail"><span>Model status</span><span className="status-badge"><i/> Demo only</span></div>
              <div className="insight-disclaimer"><CircleHelp size={15}/><span>Use forecasts alongside actual prices, local conditions, and your own cost estimates.</span></div>
            </article>
          </section>

          <section className="panel mandi-panel" id="mandi-section">
            <div className="panel-heading mandi-heading">
              <div><h3>Mandi comparison</h3><p>Compare reported prices and estimated net returns after transport.</p></div>
              <div className="table-actions">
                <label className="search-box"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mandi..." aria-label="Search mandi"/></label>
                <label className="district-select"><select value={district} onChange={e => setDistrict(e.target.value)} aria-label="Filter district"><option>All districts</option><option>Nashik</option><option>Pune</option><option>Latur</option><option>Akola</option><option>Amravati</option><option>Washim</option><option>Ahilyanagar</option><option>Satara</option><option>Sangamner</option></select><ChevronDown size={14}/></label>
              </div>
            </div>
            <div className="quantity-row"><div><span className="quantity-label">Your quantity</span><span className="quantity-sub">Adjust to estimate total return</span></div><div className="quantity-control"><button onClick={() => setQuantity(Math.max(1, quantity - 5))} aria-label="Decrease quantity">−</button><strong>{quantity} <small>qtl</small></strong><button onClick={() => setQuantity(quantity + 5)} aria-label="Increase quantity">+</button></div></div>
            <div className="table-scroll"><table>
              <thead><tr><th>MARKET / LOCATION</th><th>MODAL PRICE <span>₹/qtl</span></th><th>CHANGE</th><th>TRANSPORT <span>₹/qtl</span></th><th>EST. NET <span>₹/qtl</span></th><th>EST. TOTAL <span>{quantity} qtl</span></th><th>STATUS</th></tr></thead>
              <tbody>
                {mandis.map((m, index) => <tr key={m.name}>
                  <td><div className="market-name"><span className={`market-avatar avatar-${index % 4}`}>{m.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</span><div><strong>{m.name}</strong><span><MapPin size={11}/>{m.district} · {m.distance} km</span></div></div></td>
                  <td><strong className="price-cell">{money(m.price)}</strong><small className="updated-text">{m.updated}</small></td>
                  <td><span className={`change-pill ${m.change >= 0 ? "up" : "down"}`}>{m.change >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {Math.abs(m.change).toFixed(1)}%</span></td>
                  <td>{money(m.transport)}</td>
                  <td><strong>{money(m.net)}</strong></td>
                  <td><strong>{money(m.net * quantity)}</strong></td>
                  <td>{bestMandi?.name === m.name ? <span className="best-badge"><Check size={12}/> Best net</span> : <span className="available-badge">Available</span>}</td>
                </tr>)}
                {mandis.length === 0 && <tr><td colSpan={7} className="empty-state">No markets match these filters. Try another search or district.</td></tr>}
              </tbody>
            </table></div>
            <div className="table-footer"><span>Showing <strong>{mandis.length}</strong> markets · Sample data for demonstration</span><span className="footer-explain"><ShieldCheck size={14}/> Net return = modal price − estimated transport</span></div>
          </section>

          <section className="bottom-grid">
            <article className="panel integrity-panel">
              <div className="mini-panel-icon"><Fingerprint size={19}/></div>
              <div className="mini-panel-copy"><h3>Transparent data, traceable updates</h3><p>Planned SHA-256 record fingerprints can help identify duplicate records and track changes to imported snapshots.</p><span className="mini-link"><ShieldCheck size={14}/> Integrity feature preview</span></div>
            </article>
            <article className="panel weather-panel">
              <div className="weather-icon"><CloudSun size={24}/></div>
              <div className="mini-panel-copy"><h3>Local context matters</h3><p>Future versions can combine verified weather and crop-arrival data with prices, when reliable sources are available.</p><span className="mini-link"><Activity size={14}/> Planned data enrichment</span></div>
            </article>
          </section>
          <footer className="footer"><span>© 2026 MandiMitr · Academic project prototype</span><span><i className="status-dot"/> Sample data only · Not financial or agricultural advice</span></footer>
        </div>
      </main>
      {mobileMenu && <button className="mobile-overlay" onClick={() => setMobileMenu(false)} aria-label="Close navigation overlay"/>}
      {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    </div>
  );
}
