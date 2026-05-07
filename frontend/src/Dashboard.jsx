import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar
} from 'recharts';
import {
  Activity, Map, Settings, Search, Bell, Waves, ActivitySquare, Layers,
  Thermometer, Droplet, Menu, ChevronLeft, ChevronDown, List, Droplets, BookKey, Maximize, ZoomIn, Search as ZoomOut, AlertTriangle, Info, Clock, BarChart3, TrendingUp, PieChart, Building2, Map as MapIcon, Database, CheckSquare, Settings as SettingsIcon, PanelLeftClose, Filter, Download
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, LayersControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import axios from 'axios';
import { useDashboard } from './context/DashboardContext';
import { motion } from 'framer-motion';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import WaterMonitoringView from './WaterMonitoring';

const BACKEND_URL = 'http://localhost:8000';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const navItems = [
    { name: 'Dashboard', icon: <Database size={18} />, path: '/' },
    { name: 'CPCB Data', icon: <CheckSquare size={18} />, path: '/cpcb' },
    { name: 'Satellite Manager', icon: <MapIcon size={18} />, path: '/satellite' },
    { name: 'Spectral Indices', icon: <Layers size={18} />, path: '/spectral' },
    { name: 'Chlorophyll Mapping', icon: <Droplets size={18} />, path: '/chlorophyll' },
    { name: 'ML Models', icon: <Activity size={18} />, path: '/ml' },
    { name: 'Time Series',        icon: <TrendingUp size={18} />, path: '/timeseries' },
    { name: 'Water Monitoring',   icon: <Waves size={18} />,     path: '/water-monitoring' },
  ];
  
  const activeTabObj = navItems.find(item => item.path === location.pathname) || navItems[0];
  const activeTab = activeTabObj.name;

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`} style={{ width: isSidebarCollapsed ? '80px' : '260px', transition: 'width 0.3s' }}>
        <div className="brand" style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
          <Waves size={24} color="var(--accent-blue)" />
          {!isSidebarCollapsed && (
            <div>
              <h2>AquaSpectral</h2>
              <div className="brand-subtitle">Research Platform</div>
            </div>
          )}
        </div>

        <div className="nav-menu">
          {navItems.map(item => (
            <div
              key={item.name}
              className={`nav-item ${activeTab === item.name ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', padding: isSidebarCollapsed ? '0.75rem 0' : '0.75rem 1rem' }}
              title={isSidebarCollapsed ? item.name : ''}
            >
              {item.icon}
              {!isSidebarCollapsed && item.name}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="nav-item" style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', padding: isSidebarCollapsed ? '0.75rem 0' : '0.75rem 1rem' }}>
            <SettingsIcon size={18} />
            {!isSidebarCollapsed && "Settings"}
          </div>
          <div
            className="nav-item"
            style={{ marginTop: '0.5rem', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', padding: isSidebarCollapsed ? '0.75rem 0' : '0.75rem 1rem' }}
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          >
            <PanelLeftClose size={18} style={{ transform: isSidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
            {!isSidebarCollapsed && "Collapse"}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        <div className="top-header">
          <div className="header-title">
            <h1>{activeTab}</h1>
            <p>Water Quality Monitoring & Spectral Analysis Platform</p>
          </div>
          <div className="header-actions">
            <div className="search-bar">
              <Search size={16} className="text-muted" />
              <input type="text" placeholder="Search stations, rivers..." />
            </div>
            <button className="icon-btn">
              <Bell size={20} />
              <span className="notification-dot"></span>
            </button>
            <div className="avatar">
              <img src="/ZCOER-Logo-1-scaled.jpg" alt="User" />
            </div>
          </div>
        </div>

        <div className="dashboard-scroll">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Routes>
              <Route path="/" element={<MainDashboard />} />
              <Route path="/cpcb" element={<CPCBDataView />} />
              <Route path="/satellite" element={<SatelliteManagerView />} />
              <Route path="/spectral" element={<SpectralIndicesView />} />
              <Route path="/chlorophyll" element={<ChlorophyllMappingView />} />
              <Route path="/ml" element={<MLModelsView />} />
              <Route path="/timeseries" element={<TimeSeriesView />} />
              <Route path="/water-monitoring" element={<WaterMonitoringView />} />
            </Routes>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// INDIVIDUAL VIEWS
// ==========================================

function MainDashboard() {
  const { data, alerts, spectral, loading, error, rivers, selectedRiver, setSelectedRiver } = useDashboard();
  const [searchQuery, setSearchQuery] = useState('');

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--accent-blue)' }}>Loading platform data...</div>;
  if (error) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--accent-red)' }}>Error: {error}</div>;
  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Waiting for data...</div>;

  const markers = data.markers || [];
  const trends = data.trends || [];
  const filteredMarkers = markers.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const Gauge = ({ value, max, label, unit, status, color }) => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const boundedValue = Math.min(Math.max(value, 0), max);
    const strokeDashoffset = circumference - ((boundedValue / max) * circumference);

    return (
      <div className="gauge-item">
        <div className="gauge-svg-container">
          <svg width="90" height="90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r={radius} fill="transparent" stroke="var(--border-color)" strokeWidth="6" />
            <circle cx="45" cy="45" r={radius} fill="transparent" stroke={color} strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" transform="rotate(-90 45 45)" style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
          </svg>
          <div className="gauge-text" style={{ color: color }}>{value.toFixed(1)}</div>
        </div>
        <div className="gauge-label">
          <div className="gauge-name">{label} {unit && `(${unit})`}</div>
          <div className={`gauge-status`} style={{ color: color, borderColor: `${color}40`, backgroundColor: `${color}1A` }}>{status}</div>
        </div>
      </div>
    );
  };

  const createClusterCustomIcon = function (cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `<div style="background: rgba(47, 129, 247, 0.2); border: 1px solid var(--accent-blue); color: var(--accent-blue); border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px var(--accent-blue); font-weight: bold; backdrop-filter: blur(4px);">${count}</div>`,
      className: 'custom-marker-cluster',
      iconSize: L.point(34, 34, true),
    });
  };


  return (
    <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.3s' }}>
      {/* Top Cards Grid */}
      <motion.div 
        className="top-cards"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
      >
        <motion.div className="card basin-card" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <MapIcon size={16} /> Select River Basin
          </div>
          <div className="basin-select" style={{ padding: 0 }}>
            <select 
              value={selectedRiver} 
              onChange={(e) => setSelectedRiver(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', width: '100%', padding: '0.75rem 1rem', cursor: 'pointer', outline: 'none' }}
              disabled={loading}
            >
              {rivers.map(r => (
                <option key={r} value={r} style={{ background: 'var(--bg-app)' }}>River {r}</option>
              ))}
            </select>
          </div>
        </motion.div>

        <motion.div className="card stat-card" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
          <div className="stat-card-header">
            <div>
              <div className="stat-title">Dissolved Oxygen</div>
              <div className="stat-value">{data?.stats.do.value || "6.8"}<span className="stat-unit">mg/L</span></div>
            </div>
            <div className="stat-icon" style={{ backgroundColor: 'rgba(46, 160, 67, 0.1)', color: 'var(--accent-green)' }}><Droplet size={20} /></div>
          </div>
          <div className={`stat-change ${data?.stats.do.trend < 0 ? 'text-danger' : 'text-success'}`}>
            {data?.stats.do.trend < 0 ? <ActivitySquare size={14} /> : <TrendingUp size={14} />}
            {data?.stats.do.trend > 0 ? "+" : ""}{data?.stats.do.trend}% vs last month
          </div>
        </motion.div>

        <motion.div className="card stat-card" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
          <div className="stat-card-header">
            <div>
              <div className="stat-title">BOD Level</div>
              <div className="stat-value">{data?.stats.bod.value || "4.2"}<span className="stat-unit">mg/L</span></div>
            </div>
            <div className="stat-icon" style={{ backgroundColor: 'rgba(210, 153, 34, 0.1)', color: 'var(--accent-yellow)' }}><Activity size={20} /></div>
          </div>
          <div className={`stat-change ${data?.stats.bod.trend < 0 ? 'text-danger' : 'text-success'}`}>
            <TrendingUp size={14} /> {data?.stats.bod.trend > 0 ? "+" : ""}{data?.stats.bod.trend}% vs last month
          </div>
        </motion.div>

        <motion.div className="card stat-card" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
          <div className="stat-card-header">
            <div>
              <div className="stat-title">Water Temp</div>
              <div className="stat-value">{data?.stats.temp.value || "24.5"}<span className="stat-unit">°C</span></div>
            </div>
            <div className="stat-icon" style={{ backgroundColor: 'rgba(47, 129, 247, 0.1)', color: 'var(--accent-blue)' }}><Thermometer size={20} /></div>
          </div>
          <div className={`stat-change ${data?.stats.temp.trend < 0 ? 'text-danger' : 'text-success'}`}>
            <TrendingUp size={14} /> {data?.stats.temp.trend > 0 ? "+" : ""}{data?.stats.temp.trend}% vs last month
          </div>
        </motion.div>

        <motion.div className="card stat-card" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
          <div className="stat-card-header">
            <div>
              <div className="stat-title">Chlorophyll-a</div>
              <div className="stat-value">{data?.stats.chla.value || "18.4"}<span className="stat-unit">µg/L</span></div>
            </div>
            <div className="stat-icon" style={{ backgroundColor: 'rgba(210, 153, 34, 0.1)', color: 'var(--accent-yellow)' }}><List size={20} /></div>
          </div>
          <div className={`stat-change ${data?.stats.chla.trend < 0 ? 'text-danger' : 'text-success'}`}>
            <TrendingUp size={14} /> {data?.stats.chla.trend > 0 ? "+" : ""}{data?.stats.chla.trend}% vs last month
          </div>
        </motion.div>
      </motion.div>

      {/* Gauges Section */}
      <div className="gauge-section">
        <h3 className="section-title">Water Quality Index - {selectedRiver}</h3>
        {data && data.gauges && (
          <div className="gauges-grid">
            <Gauge value={data.gauges.do.value} max={10} label="DO" unit="mg/L" status={data.gauges.do.status} color="var(--accent-cyan)" />
            <Gauge value={data.gauges.ph.value} max={14} label="pH" unit="" status={data.gauges.ph.status} color="var(--accent-green)" />
            <Gauge value={data.gauges.bod.value} max={10} label="BOD" unit="mg/L" status={data.gauges.bod.status} color="var(--accent-blue)" />
            <Gauge value={data.gauges.conductivity.value} max={500} label="Conductivity" unit="" status={data.gauges.conductivity.status} color="var(--accent-cyan)" />
            <Gauge value={data.gauges.chla.value} max={50} label="Chl-a" unit="µg/L" status={data.gauges.chla.status} color="var(--accent-blue)" />
            <Gauge value={data.gauges.nitrates.value} max={10} label="Nitrates" unit="" status={data.gauges.nitrates.status} color="var(--accent-green)" />
          </div>
        )}
      </div>

      {/* Map and Alerts Grid */}
      <div className="main-split">
        <div className="map-card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="map-header" style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem', margin: 0, zIndex: 10, position: 'relative' }}>
            <h3>Monitoring Stations</h3>
            <div className="map-tools">
              <input 
                type="text" 
                placeholder="Search station..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: '150px' }}
              />
            </div>
          </div>
          <div className="map-container" style={{ flex: 1, minHeight: '350px', position: 'relative' }}>
            <MapContainer center={[22.9, 78.9]} zoom={4} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="Dark Map">
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Satellite">
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution='Tiles &copy; Esri'
                  />
                </LayersControl.BaseLayer>
              </LayersControl>
              <ZoomControl position="topright" />
              <MarkerClusterGroup iconCreateFunction={createClusterCustomIcon} showCoverageOnHover={false} maxClusterRadius={40}>
                {filteredMarkers.map(marker => (
                  <Marker 
                    key={marker.id} 
                    position={[marker.lat, marker.lng]}
                    icon={L.divIcon({
                      html: `<div class="marker-glow marker-${marker.status}"></div>`,
                      className: 'custom-marker',
                      iconSize: L.point(20, 20),
                    })}
                  >
                    <Popup closeButton={true}>
                      <div style={{ marginBottom: '5px' }}>
                        <strong style={{ fontSize: '1.05rem', color: '#fff' }}>{marker.name}</strong>
                      </div>
                      <div style={{ fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-muted)' }}>
                        Status: <span style={{ color: `var(--accent-${marker.status === 'Good'? 'green' : marker.status === 'Moderate'? 'blue' : marker.status === 'Poor'? 'yellow' : 'red'})`, fontWeight: '600' }}>{marker.status}</span> 
                        <span style={{ margin: '0 6px' }}>|</span> AQI: {marker.aqi}
                      </div>
                      <div style={{ fontSize: '0.8rem', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                        {marker.details}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            </MapContainer>
            
            <div className="map-legend" style={{ zIndex: 1000 }}>
              <div style={{ fontWeight: 600, marginBottom: '0.2rem', color: '#fff' }}>Water Quality Index</div>
              <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)' }}></div> Good</div>
              <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--accent-blue)', boxShadow: '0 0 8px var(--accent-blue)' }}></div> Moderate</div>
              <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--accent-yellow)', boxShadow: '0 0 8px var(--accent-yellow)' }}></div> Poor</div>
              <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--accent-red)', boxShadow: '0 0 8px var(--accent-red)' }}></div> Critical</div>
            </div>
          </div>
        </div>

        <div className="alerts-card">
          <div className="alerts-header">
            <h3>Recent Alerts</h3>
            <div className="alerts-count">{alerts.filter(a => a.type === 'critical').length} Critical</div>
          </div>
          <div className="alerts-list">
            {alerts.map((alert) => (
              <div key={alert.id} className={`alert-item alert-${alert.type}`} style={{ borderColor: alert.type === 'info' || alert.type === 'warning' ? 'var(--border-color)' : '', backgroundColor: alert.type === 'info' || alert.type === 'warning' ? 'var(--bg-card)' : '' }}>
                {alert.type === 'critical' || alert.type === 'warning' ? (
                  <AlertTriangle className={`alert-icon text-${alert.type}`} size={18} style={alert.type === 'warning' ? { color: 'var(--accent-yellow)' } : {}} />
                ) : (
                  <Info className="alert-icon text-info" size={18} style={{ color: 'var(--accent-blue)' }} />
                )}
                <div className="alert-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="alert-title">{alert.title}</div>
                    <div className="alert-time"><Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {alert.time}</div>
                  </div>
                  <div className="alert-loc">{alert.location}</div>
                  <div className="alert-desc">{alert.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bottom-split">
        <div className="chart-card">
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Seasonal Water Quality Trends</h3>
          <div style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} itemStyle={{ fontSize: '0.85rem' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.8rem', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="do" stroke="var(--accent-cyan)" strokeWidth={2} dot={{ r: 3 }} name="DO (mg/L)" />
                <Line type="monotone" dataKey="bod" stroke="var(--accent-blue)" strokeWidth={2} dot={{ r: 3 }} name="BOD (mg/L)" />
                <Line type="monotone" dataKey="chla" stroke="var(--accent-yellow)" strokeWidth={2} dot={{ r: 3 }} name="Chl-a (µg/L)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem' }}>Spectral Signature</h3>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>Water pixel sample</span>
          </div>
          <div style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spectral} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="wavelength" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} itemStyle={{ fontSize: '0.85rem', color: 'var(--accent-green)' }} />
                <Area type="monotone" dataKey="reflectance" stroke="var(--accent-green)" fillOpacity={1} fill="url(#colorRef)" name="Reflectance (%)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// CPCB Data View
// ==========================================
function CPCBDataView() {
  const [data, setData] = useState([]);
  const { rivers } = useDashboard();
  const [selectedRiver, setSelectedRiver] = useState('All');
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/cpcb_data?river=${selectedRiver}&search=${search}`)
      .then(res => setData(res.data))
      .catch(err => console.error(err));
  }, [selectedRiver, search]);

  return (
    <div className="chart-card" style={{ height: 'calc(100vh - 150px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3>Central Pollution Control Board (CPCB) Synchronization</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select value={selectedRiver} onChange={e => setSelectedRiver(e.target.value)} className="basin-select" style={{ marginTop: 0, padding: '0.4rem 1rem' }}>
            <option value="All">All Rivers</option>
            {rivers.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="text" placeholder="Search Location..." value={search} onChange={e => setSearch(e.target.value)} className="basin-select" style={{ marginTop: 0, padding: '0.4rem 1rem', width: '200px', outline: 'none' }} />
          <button className="basin-select" style={{ marginTop: 0, padding: '0.5rem 1rem', background: 'var(--accent-blue)', color: '#fff', border: 'none' }}><Download size={14} style={{ marginRight: '8px' }} /> Export CSV</button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '1rem 0' }}>Station ID</th>
            <th>River</th>
            <th>Location</th>
            <th>DO (mg/L)</th>
            <th>BOD (mg/L)</th>
            <th>Status</th>
            <th>Last Sync</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '1rem 0', color: 'var(--accent-blue)' }}>{row.id}</td>
              <td>{row.river}</td>
              <td>{row.location}</td>
              <td style={{ color: row.do < 4 ? 'var(--accent-red)' : 'var(--text-main)' }}>{row.do}</td>
              <td style={{ color: row.bod > 6 ? 'var(--accent-red)' : 'var(--text-main)' }}>{row.bod}</td>
              <td>
                <span style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  backgroundColor: row.status === 'Good' ? 'rgba(46, 160, 67, 0.1)' : row.status === 'Excellent' ? 'rgba(46, 160, 67, 0.2)' : 'rgba(248, 81, 73, 0.1)',
                  color: row.status === 'Poor' ? 'var(--accent-red)' : 'var(--accent-green)'
                }}>
                  {row.status}
                </span>
              </td>
              <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{row.lastUpdate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// Satellite Manager View — CONNECTED
// ==========================================
function SatelliteManagerView() {
  const [spectralData, setSpectralData] = useState([]);
  const [indicesData, setIndicesData] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState('NDWI');
  const [loadingSpectral, setLoadingSpectral] = useState(true);
  const [loadingIndices, setLoadingIndices] = useState(true);
  const [activeSat, setActiveSat] = useState('Sentinel-2A');

  const satellites = [
    { tag: 'Sentinel-2A', status: 'Active Sync', band: 'Multispectral', res: '10m', color: 'var(--accent-green)', pulse: true },
    { tag: 'Sentinel-2B', status: 'Active Sync', band: 'Multispectral', res: '10m', color: 'var(--accent-green)', pulse: true },
    { tag: 'Landsat-8',   status: 'Archive Only', band: 'Multispectral', res: '30m', color: 'var(--accent-yellow)', pulse: false },
    { tag: 'Landsat-9',   status: 'Connecting…',  band: 'Multispectral', res: '30m', color: 'var(--accent-blue)',   pulse: false },
  ];

  useEffect(() => {
    setLoadingSpectral(true);
    axios.get(`${BACKEND_URL}/api/spectral`)
      .then(res => setSpectralData(res.data))
      .catch(err => console.error('spectral error', err))
      .finally(() => setLoadingSpectral(false));
  }, [activeSat]);

  useEffect(() => {
    setLoadingIndices(true);
    axios.get(`${BACKEND_URL}/api/spectral_indices?index_type=${selectedIndex}`)
      .then(res => setIndicesData(res.data))
      .catch(err => console.error('indices error', err))
      .finally(() => setLoadingIndices(false));
  }, [selectedIndex]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Row: Satellite Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {satellites.map(sat => (
          <div
            key={sat.tag}
            onClick={() => setActiveSat(sat.tag)}
            style={{
              padding: '1.1rem',
              border: `1px solid ${activeSat === sat.tag ? sat.color : 'var(--border-color)'}`,
              borderRadius: '10px',
              background: activeSat === sat.tag ? `${sat.color}14` : 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
              transition: 'all 0.25s',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {activeSat === sat.tag && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: sat.color, borderRadius: '10px 10px 0 0' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
              <h4 style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>{sat.tag}</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', backgroundColor: sat.color,
                  boxShadow: sat.pulse ? `0 0 8px ${sat.color}` : 'none',
                }} />
              </div>
            </div>
            <div style={{ fontSize: '0.78rem', color: sat.color, marginBottom: '0.3rem', fontWeight: 600 }}>{sat.status}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bands: {sat.band} · {sat.res}</div>
          </div>
        ))}
      </div>

      {/* Middle Row: Spectral Reflectance + Index Selector */}
      <div className="bottom-split">
        {/* Spectral Reflectance from Backend */}
        <div className="chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem' }}>Spectral Reflectance Curve</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Source: {activeSat} · Water pixel sample</p>
            </div>
            {loadingSpectral && <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)' }}>Fetching…</div>}
          </div>
          <div style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spectralData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="satGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="wavelength" stroke="var(--text-muted)" fontSize={11} label={{ value: 'Wavelength (nm)', position: 'insideBottomRight', offset: -10, fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" fontSize={11} label={{ value: 'Reflectance (%)', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(val) => [`${val.toFixed(2)}%`, 'Reflectance']}
                  labelFormatter={(l) => `${l} nm`}
                />
                <Area type="monotone" dataKey="reflectance" stroke="var(--accent-cyan)" strokeWidth={2} fillOpacity={1} fill="url(#satGrad)" dot={{ r: 3, fill: 'var(--accent-cyan)' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Spectral Indices Timeline from Backend */}
        <div className="chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem' }}>Spectral Index Timeline</h3>
            <select
              value={selectedIndex}
              onChange={e => setSelectedIndex(e.target.value)}
              className="basin-select"
              style={{ margin: 0, padding: '0.35rem 0.8rem', fontSize: '0.82rem' }}
            >
              <option value="NDWI">NDWI</option>
              <option value="NDVI">NDVI</option>
              <option value="NDBI">NDBI</option>
              <option value="NDCI">NDCI</option>
            </select>
          </div>
          {loadingIndices ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)' }}>Loading index data…</div>
          ) : (
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={indicesData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} domain={[-0.5, 1]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '0.82rem' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '0.78rem' }} />
                  <Line type="monotone" dataKey="NDWI" stroke="var(--accent-blue)"   strokeWidth={2} dot={{ r: 3 }} name="NDWI" />
                  <Line type="monotone" dataKey="NDVI" stroke="var(--accent-green)"  strokeWidth={2} dot={{ r: 3 }} name="NDVI" />
                  <Line type="monotone" dataKey="NDBI" stroke="#8b949e" strokeWidth={2} dot={{ r: 3 }} name="NDBI" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Band Stats Table */}
      <div className="chart-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem' }}>Live Band Analysis — {activeSat}</h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--accent-green)' }}>● Live Feed</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.7rem 0', textAlign: 'left' }}>Wavelength (nm)</th>
              <th style={{ textAlign: 'left' }}>Band Name</th>
              <th style={{ textAlign: 'left' }}>Reflectance (%)</th>
              <th style={{ textAlign: 'left' }}>Quality</th>
            </tr>
          </thead>
          <tbody>
            {spectralData.map((row, i) => {
              const bandNames = ['Coastal Aerosol','Blue','Green','Red','Red Edge','Red Edge 2','NIR','NIR 2','SWIR 1','SWIR 2','Thermal'];
              const quality = row.reflectance > 7 ? 'Excellent' : row.reflectance > 4 ? 'Good' : 'Low';
              const qualColor = quality === 'Excellent' ? 'var(--accent-green)' : quality === 'Good' ? 'var(--accent-blue)' : 'var(--accent-yellow)';
              return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.6rem 0', color: 'var(--accent-cyan)' }}>{row.wavelength} nm</td>
                  <td style={{ color: 'var(--text-muted)' }}>{bandNames[i] || `Band ${i+1}`}</td>
                  <td style={{ color: 'var(--text-main)', fontWeight: 600 }}>{row.reflectance?.toFixed(2)}%</td>
                  <td><span style={{ padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem', color: qualColor, background: `${qualColor}1a`, border: `1px solid ${qualColor}40` }}>{quality}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// Spectral Indices View
// ==========================================
function SpectralIndicesView() {
  const [data, setData] = useState([]);
  const [indexType, setIndexType] = useState('NDWI');
  const [loading, setLoading] = useState(false);

  const calculateIndex = () => {
    setLoading(true);
    axios.get(`${BACKEND_URL}/api/spectral_indices?index_type=${indexType}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
  };
  
  useEffect(() => { calculateIndex(); }, [indexType]);

  return (
    <div className="chart-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3>Spectral Indices Calculator</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={indexType} onChange={e => setIndexType(e.target.value)} className="basin-select" style={{ margin: 0, padding: '0.4rem 1rem' }}>
            <option value="NDWI">NDWI (Water)</option>
            <option value="NDVI">NDVI (Vegetation)</option>
            <option value="NDBI">NDBI (Built-up)</option>
            <option value="NDCI+">NDCI+ (Chlorophyll)</option>
          </select>
          <button onClick={calculateIndex} className="basin-select" style={{ margin: 0, padding: '0.4rem 1rem', background: 'var(--accent-blue)', color: '#fff' }}>{loading ? 'Calculating...' : 'Calculate'}</button>
        </div>
      </div>

      <div style={{ height: '400px', marginTop: '2rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-muted)" />
            <YAxis stroke="var(--text-muted)" />
            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
            <Legend />
            <Bar dataKey="NDWI" fill="var(--accent-blue)" name="Water Index (NDWI)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="NDVI" fill="var(--accent-green)" name="Vegetation Index (NDVI)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="NDBI" fill="#8b949e" name="Built-up Index (NDBI)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ==========================================
// Generic Placeholder Views 
// ==========================================
function ChlorophyllMappingView() {
  const { rivers } = useDashboard();
  const [selectedRiver, setSelectedRiver] = useState('Godavari');
  const [year, setYear] = useState(2023);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { if (rivers.length > 0) setSelectedRiver(rivers[0]); }, [rivers]);

  const processSatelliteData = () => {
    setLoading(true);
    axios.post(`${BACKEND_URL}/api/process-river`, { river: selectedRiver, year: Number(year) })
      .then(res => {
        setResult(res.data);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  return (
    <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '600px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
        <h3>Earth Engine Satellite Imaging</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={selectedRiver} onChange={e => setSelectedRiver(e.target.value)} className="basin-select" style={{ margin: 0, padding: '0.4rem 1rem' }}>
            {rivers.length > 0 ? rivers.map(r => <option key={r} value={r}>{r}</option>) : <option value="Godavari">Godavari</option>}
          </select>
          <select value={year} onChange={e => setYear(e.target.value)} className="basin-select" style={{ margin: 0, padding: '0.4rem 1rem' }}>
            {[2023, 2022, 2021, 2020].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={processSatelliteData} disabled={loading} className="basin-select" style={{ margin: 0, padding: '0.4rem 1rem', background: 'var(--accent-blue)', color: '#fff' }}>
            {loading ? 'Processing...' : 'Run Pipeline'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, backgroundColor: '#050a0f', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: '1rem' }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', alignItems: 'center' }}>
            {result.mocked && <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(210,153,34,0.2)', color: 'var(--accent-yellow)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem', zIndex: 10 }}>🌐 Using localized geometry-driven plotting</div>}
            <img src={result.image_url} alt="Satellite Output" style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'white' }} />
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', width: '100%', marginTop: '1.5rem' }}>
              {Object.entries(result.stats || {}).map(([key, val]) => (
                <div key={key} style={{ background: 'var(--bg-card)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{key.replace('_mean', '')}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-green)', marginTop: '0.2rem' }}>{val.toFixed(3)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>{loading ? 'Running Google Earth Engine pipeline... This may take a minute.' : 'Select a river and year, then click Run Pipeline to generate satellite maps.'}</div>
        )}
      </div>
    </div>
  );
}

function MLModelsView() {
  const [stats, setStats] = useState(null);
  const [training, setTraining] = useState(false);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/ml_models`).then(res => setStats(res.data));
  }, []);

  if (!stats) return <div style={{ color: 'var(--text-muted)' }}>Loading Models...</div>;

  const retrain = () => {
    setTraining(true);
    setTimeout(() => {
      axios.get(`${BACKEND_URL}/api/ml_models`).then(res => { setStats(res.data); setTraining(false); });
    }, 1500);
  };

  return (
    <div className="top-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="chart-card">
        <h3>Random Forest Classifier</h3>
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>Used for multi-class water body extraction.</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          <span>Accuracy Score</span> <span className="text-success">{stats.rf.accuracy}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          <span>F1-Score</span> <span className="text-success">{stats.rf.f1}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
          <span>Last Trained</span> <span>{stats.rf.lastTrained}</span>
        </div>
        <button onClick={retrain} disabled={training} className="basin-select" style={{ width: '100%', justifyContent: 'center' }}>{training ? 'Training...' : 'Retrain Model'}</button>
      </div>

      <div className="chart-card">
        <h3>LSTM Time-Series Forecaster</h3>
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>Predicts BOD and DO levels for the next 7 days.</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          <span>RMSE Loss (DO)</span> <span className="text-success">{stats.lstm.rmse_do} mg/L</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          <span>RMSE Loss (BOD)</span> <span className="text-success">{stats.lstm.rmse_bod} mg/L</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
          <span>Dataset Size</span> <span>{stats.lstm.samples.toLocaleString()} records</span>
        </div>
        <button className="basin-select" style={{ width: '100%', justifyContent: 'center' }}>View Forecast Plot</button>
      </div>
    </div>
  );
}

function TimeSeriesView() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.post(`${BACKEND_URL}/api/time-series`, { river: 'All' })
      .then(res => {
        if (res.data.status === 'success') {
          setData(res.data.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="chart-card" style={{ height: '500px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3>Yearly Spectral Time Series</h3>
        <button className="basin-select" style={{ margin: 0, padding: '0.4rem 1rem' }}>Last 5 Years <ChevronDown size={14} style={{ marginLeft: '0.5rem' }} /></button>
      </div>
      {loading ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '100px' }}>Loading Time Series...</div> : (
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorNdwi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorNdvi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey="year" stroke="var(--text-muted)" />
            <YAxis stroke="var(--text-muted)" />
            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
            <Legend />
            <Area type="monotone" dataKey="NDWI" stroke="var(--accent-blue)" fillOpacity={1} fill="url(#colorNdwi)" name="NDWI (Water)" />
            <Area type="monotone" dataKey="NDVI" stroke="var(--accent-green)" fillOpacity={1} fill="url(#colorNdvi)" name="NDVI (Vegetation)" />
            <Area type="monotone" dataKey="NDTI" stroke="var(--accent-yellow)" fillOpacity={0} name="NDTI (Turbidity)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
