/**
 * WaterMonitoring.jsx
 * -------------------
 * Satellite-based Water Monitoring for Maharashtra, India.
 * Fully self-contained module — does NOT modify any existing components.
 *
 * Features:
 *  • Interactive Leaflet map with water body markers & NDWI colour overlay
 *  • Year slider 2020-2025 (Sentinel-2 primary / Landsat fallback)
 *  • Layer toggles: RGB base, Water Mask overlay, NDWI Heatmap
 *  • Per-water-body time-series chart (Recharts AreaChart)
 *  • State-wide summary stats cards
 *  • Fully dark-themed matching existing design system
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line
} from 'recharts';
import {
  Waves, Layers, TrendingUp, Droplets, Map as MapIcon,
  ChevronLeft, ChevronRight, Info, AlertTriangle, Activity,
  BarChart3, Globe, Satellite, X, ImageIcon
} from 'lucide-react';
import {
  MapContainer, TileLayer, CircleMarker, Popup, Rectangle,
  LayersControl, ZoomControl
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_API_URL;
const YEARS   = [2020, 2021, 2022, 2023, 2024, 2025];

// ─── Colour helpers ────────────────────────────────────────────────────────────
const ndwiColor = (ndwi) => {
  if (ndwi > 0.6) return '#39c5cf';
  if (ndwi > 0.4) return '#2f81f7';
  if (ndwi > 0.2) return '#d29922';
  return '#f85149';
};

const typeIcon = (type) => {
  const icons = { river: '🌊', reservoir: '🏞️', lake: '🔵', coast: '🌊' };
  return icons[type] || '💧';
};

const qualityBadge = (label) => {
  const map = {
    Excellent: { bg: 'rgba(46,160,67,0.15)',  border: 'rgba(46,160,67,0.4)',  text: '#2ea043' },
    Good:      { bg: 'rgba(47,129,247,0.15)', border: 'rgba(47,129,247,0.4)', text: '#2f81f7' },
    Moderate:  { bg: 'rgba(210,153,34,0.15)', border: 'rgba(210,153,34,0.4)', text: '#d29922' },
    Low:       { bg: 'rgba(248,81,73,0.15)',  border: 'rgba(248,81,73,0.4)',  text: '#f85149' },
  };
  return map[label] || map.Moderate;
};

// ─── Segmentation Modal ───────────────────────────────────────────────────────
function SegmentationModal({ wb, onClose }) {
  const [imgStatus, setImgStatus] = useState('loading'); // loading | loaded | error
  const imgUrl = `${BACKEND}/api/water-monitoring/segmentation/${wb.id}?t=${Date.now()}`;

  return (
    <div
      id="wm-seg-modal-backdrop"
      onClick={e => { if (e.target.id === 'wm-seg-modal-backdrop') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(5, 10, 15, 0.88)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        maxWidth: '860px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        position: 'relative',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.2rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(47,129,247,0.1)', border: '1px solid rgba(47,129,247,0.3)', borderRadius: '8px', padding: '0.4rem', display: 'flex' }}>
              <ImageIcon size={18} color="var(--accent-blue)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                {wb.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                Sentinel-2 RGB + NDWI Segmentation · Pre-Monsoon / Monsoon Peak / Post-Monsoon
              </div>
            </div>
          </div>
          <button
            id="wm-seg-modal-close"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '0.4rem 0.6rem', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.8rem', transition: 'all 0.15s',
            }}
          >
            <X size={14} /> Close
          </button>
        </div>

        {/* Image area */}
        <div style={{ padding: '1.25rem', background: 'white', borderRadius: '0 0 14px 14px' }}>
          {imgStatus === 'loading' && (
            <div style={{
              height: '320px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
              color: '#333', background: 'white',
            }}>
              <Waves size={36} color="#2f81f7" style={{ animation: 'spin 2s linear infinite' }} />
              <div style={{ fontSize: '0.9rem', color: '#555' }}>Generating satellite images…</div>
              <div style={{ fontSize: '0.75rem', color: '#999' }}>First request may take 1–3 seconds</div>
            </div>
          )}
          {imgStatus === 'error' && (
            <div style={{
              height: '220px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              color: '#c00', background: 'white',
            }}>
              <AlertTriangle size={28} />
              <div style={{ fontSize: '0.88rem' }}>Failed to load segmentation image</div>
              <div style={{ fontSize: '0.75rem', color: '#999' }}>Check backend is running on port 8000</div>
            </div>
          )}
          <img
            src={imgUrl}
            alt={`Segmentation grid — ${wb.name}`}
            onLoad={() => setImgStatus('loaded')}
            onError={() => setImgStatus('error')}
            style={{
              width: '100%',
              display: imgStatus === 'loaded' ? 'block' : 'none',
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
            }}
          />
        </div>

        {/* Footer legend */}
        <div style={{
          padding: '0.75rem 1.5rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
          fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          {[
            { dot: '#1a3a62', label: 'Satellite tile (Sentinel-2 RGB)' },
            { dot: '#4a90e2', label: 'Water detected (NDWI > 0.2)' },
            { dot: '#cccccc', label: 'Non-water / land surface' },
          ].map(({ dot, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <div style={{ marginLeft: 'auto', color: 'var(--accent-blue)', fontSize: '0.72rem' }}>
            {wb.district} · {wb.type} · NDWI {wb.ndwi?.toFixed(3)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Stat summary card matching the existing design */
function StatCard({ icon, title, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '10px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{title}</div>
        <div style={{ color, background: `${color}1a`, borderRadius: '6px', padding: '0.3rem', display: 'flex' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

/** Year slider control */
function YearSlider({ year, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.8rem 1.2rem' }}>
      <Satellite size={16} color="var(--accent-blue)" />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Year</span>
      <button
        id="wm-year-prev"
        onClick={() => onChange(Math.max(YEARS[0], year - 1))}
        disabled={year === YEARS[0]}
        style={{ background: 'none', border: 'none', color: year === YEARS[0] ? 'var(--border-color)' : 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
      ><ChevronLeft size={18} /></button>

      {YEARS.map(y => (
        <button
          key={y}
          onClick={() => onChange(y)}
          id={`wm-year-${y}`}
          style={{
            background: y === year ? 'var(--accent-blue)' : 'transparent',
            border: `1px solid ${y === year ? 'var(--accent-blue)' : 'var(--border-color)'}`,
            borderRadius: '6px',
            color: y === year ? '#fff' : 'var(--text-muted)',
            fontSize: '0.8rem',
            padding: '0.25rem 0.6rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontWeight: y === year ? 600 : 400,
          }}
        >{y}</button>
      ))}

      <button
        id="wm-year-next"
        onClick={() => onChange(Math.min(YEARS[YEARS.length - 1], year + 1))}
        disabled={year === YEARS[YEARS.length - 1]}
        style={{ background: 'none', border: 'none', color: year === YEARS[YEARS.length - 1] ? 'var(--border-color)' : 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
      ><ChevronRight size={18} /></button>

      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--accent-cyan)', whiteSpace: 'nowrap' }}>
        Sentinel-2{year < 2017 ? ' / Landsat' : ''}
      </span>
    </div>
  );
}

/** Time-series chart for selected water body */
function WaterBodyTimeSeries({ waterBodyId, waterBodyName }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!waterBodyId) return;
    setLoading(true);
    axios.get(`${BACKEND}/api/water-monitoring/timeseries/${waterBodyId}`)
      .then(res => {
        if (res.data.status === 'success') setSeries(res.data.series);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [waterBodyId]);

  if (!waterBodyId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', color: 'var(--text-muted)', gap: '0.5rem' }}>
        <MapIcon size={32} strokeWidth={1} />
        <span style={{ fontSize: '0.88rem' }}>Click a water body on the map to view its time-series</span>
      </div>
    );
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '220px', color: 'var(--accent-blue)', fontSize: '0.85rem' }}>Loading time-series…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{waterBodyName}</span>
        <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>NDWI · 2020 – 2025</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={series} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="wm-ndwi-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--accent-cyan)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="wm-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--accent-blue)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
          <XAxis dataKey="year" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 1]} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.82rem' }}
            formatter={(val, name) => [typeof val === 'number' ? val.toFixed(4) : val, name]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
          <Area type="monotone" dataKey="ndwi"  stroke="var(--accent-cyan)"  fillOpacity={1} fill="url(#wm-ndwi-grad)" name="NDWI" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly NDWI breakdown for selected body + year */
function MonthlyBreakdown({ series, year }) {
  if (!series || series.length === 0) return null;
  const yearData = series.find(s => s.year === String(year));
  if (!yearData) return null;

  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const labels  = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const chartData = months.map((m, i) => ({ name: labels[i], ndwi: yearData[m] || 0 }));

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Monthly NDWI · {year}</div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="var(--border-color)" vertical={false} />
          <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--text-muted)" fontSize={9} tickLine={false} axisLine={false} domain={[0,'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.78rem' }}
            formatter={val => [val?.toFixed(3), 'NDWI']}
          />
          <Line type="monotone" dataKey="ndwi" stroke="var(--accent-green)" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function WaterMonitoringView() {
  const [year, setYear]           = useState(2024);
  const [summary, setSummary]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [selectedWb, setSelectedWb]       = useState(null);
  const [selectedSeries, setSelectedSeries] = useState([]);
  const [showNDWI, setShowNDWI]   = useState(true);
  const [showMask, setShowMask]   = useState(true);
  const [activeType, setActiveType] = useState('all');
  const [heatmap, setHeatmap]     = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [segModal, setSegModal]   = useState(null); // {wb} or null

  // Fetch summary when year changes
  useEffect(() => {
    setLoading(true);
    setSummary(null);
    axios.get(`${BACKEND}/api/water-monitoring/summary?year=${year}`)
      .then(res => { if (res.data.status === 'success') setSummary(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year]);

  // Fetch heatmap when toggled
  useEffect(() => {
    if (!showHeatmap) return;
    if (heatmap && heatmap.year === year) return;
    axios.get(`${BACKEND}/api/water-monitoring/ndwi-heatmap?year=${year}`)
      .then(res => { if (res.data.status === 'success') setHeatmap(res.data); })
      .catch(() => {});
  }, [showHeatmap, year]);

  // Fetch time-series + open segmentation modal when a water body is clicked
  const handleWbSelect = useCallback((wb) => {
    setSelectedWb(wb);
    setSegModal({ wb });           // open modal immediately (image loads inside)
    axios.get(`${BACKEND}/api/water-monitoring/timeseries/${wb.id}`)
      .then(res => { if (res.data.status === 'success') setSelectedSeries(res.data.series); })
      .catch(() => {});
  }, []);

  const features = summary?.features || [];
  const stats    = summary?.state_stats || {};

  const filteredFeatures = activeType === 'all'
    ? features
    : features.filter(f => f.type === activeType);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(57,197,207,0.1)', border: '1px solid rgba(57,197,207,0.3)', borderRadius: '8px', padding: '0.5rem', display: 'flex' }}>
            <Waves size={20} color="var(--accent-cyan)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Maharashtra Water Monitoring</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Sentinel-2 NDWI · All rivers, lakes, reservoirs &amp; coast</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['all','river','reservoir','lake','coast'].map(t => (
            <button
              key={t}
              id={`wm-filter-${t}`}
              onClick={() => setActiveType(t)}
              style={{
                background: activeType === t ? 'rgba(47,129,247,0.15)' : 'transparent',
                border: `1px solid ${activeType === t ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                color: activeType === t ? 'var(--accent-blue)' : 'var(--text-muted)',
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'capitalize',
              }}
            >{t === 'all' ? 'All Types' : t}</button>
          ))}
        </div>
      </div>

      {/* ── Year slider ── */}
      <YearSlider year={year} onChange={setYear} />

      {/* ── Summary stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        <StatCard icon={<Waves size={18} />}      title="Mean NDWI"        value={loading ? '—' : stats.mean_ndwi?.toFixed(3)} sub={`Maharashtra · ${year}`} color="var(--accent-cyan)" />
        <StatCard icon={<Droplets size={18} />}   title="Total Water Area" value={loading ? '—' : `${(stats.total_water_area_km2 / 1000)?.toFixed(1)}k km²`} sub="Surface water coverage" color="var(--accent-blue)" />
        <StatCard icon={<Activity size={18} />}   title="Healthy Bodies"   value={loading ? '—' : stats.healthy_bodies} sub="NDWI > 0.4 (Good / Excellent)" color="var(--accent-green)" />
        <StatCard icon={<AlertTriangle size={18} />} title="Stressed Bodies" value={loading ? '—' : stats.stressed_bodies} sub="NDWI ≤ 0.2 (Low / Moderate)" color="var(--accent-red)" />
      </div>

      {/* ── Map + Side Panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', minHeight: '520px' }}>

        {/* Map */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
          {/* Layer toggles overlay */}
          <div style={{
            position: 'absolute', top: '1rem', left: '1rem', zIndex: 1000,
            display: 'flex', flexDirection: 'column', gap: '0.4rem',
          }}>
            {[
              { key: 'ndwi', label: 'NDWI Overlay', val: showNDWI,    set: setShowNDWI },
              { key: 'mask', label: 'Water Mask',   val: showMask,    set: setShowMask },
              { key: 'heat', label: 'NDWI Heatmap', val: showHeatmap, set: setShowHeatmap },
            ].map(({ key, label, val, set }) => (
              <button
                key={key}
                id={`wm-layer-${key}`}
                onClick={() => set(v => !v)}
                style={{
                  background: val ? 'rgba(47,129,247,0.25)' : 'rgba(15,21,27,0.85)',
                  backdropFilter: 'blur(8px)',
                  border: `1px solid ${val ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  borderRadius: '6px',
                  color: val ? 'var(--accent-blue)' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  padding: '0.35rem 0.7rem',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                <Layers size={12} />{label}
              </button>
            ))}
          </div>

          {/* Year badge */}
          <div style={{
            position: 'absolute', bottom: '1rem', right: '1rem', zIndex: 1000,
            background: 'rgba(15,21,27,0.9)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-color)', borderRadius: '8px',
            padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)',
          }}>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{year}</span>
            &nbsp;· {filteredFeatures.length} features
          </div>

          {/* NDWI legend */}
          <div style={{
            position: 'absolute', bottom: '1rem', left: '1rem', zIndex: 1000,
            background: 'rgba(15,21,27,0.85)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-color)', borderRadius: '8px',
            padding: '0.6rem 0.75rem', fontSize: '0.72rem',
          }}>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: '0.3rem' }}>NDWI</div>
            {[
              { label: '> 0.6 Excellent', c: '#39c5cf' },
              { label: '0.4 – 0.6 Good',  c: '#2f81f7' },
              { label: '0.2 – 0.4 Moderate', c: '#d29922' },
              { label: '< 0.2 Low',       c: '#f85149' },
            ].map(({ label, c }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 5px ${c}` }} />
                {label}
              </div>
            ))}
          </div>

          <MapContainer
            center={[19.2, 76.0]}
            zoom={6}
            style={{ height: '100%', width: '100%', minHeight: '500px' }}
            zoomControl={false}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Dark Map">
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='© OpenStreetMap' />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='Tiles © Esri' />
              </LayersControl.BaseLayer>
            </LayersControl>
            <ZoomControl position="topright" />

            {/* NDWI coloured bounding boxes (Water Mask) */}
            {showMask && filteredFeatures.map(f => (
              <Rectangle
                key={`mask-${f.id}-${year}`}
                bounds={f.bounds}
                pathOptions={{
                  color: ndwiColor(f.ndwi),
                  weight: 1,
                  opacity: 0.7,
                  fillColor: ndwiColor(f.ndwi),
                  fillOpacity: 0.18,
                }}
              />
            ))}

            {/* NDWI circle markers */}
            {showNDWI && filteredFeatures.map(f => (
              <CircleMarker
                key={`cm-${f.id}-${year}`}
                center={[f.lat, f.lng]}
                radius={f.type === 'river' ? 9 : f.type === 'reservoir' ? 12 : 8}
                pathOptions={{
                  color: ndwiColor(f.ndwi),
                  fillColor: ndwiColor(f.ndwi),
                  fillOpacity: 0.85,
                  weight: 2,
                }}
                eventHandlers={{ click: () => handleWbSelect(f) }}
              >
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '6px' }}>
                      {typeIcon(f.type)} {f.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                      {f.district} · {f.type} · {year}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {[
                        { k: 'NDWI', v: f.ndwi?.toFixed(4) },
                        { k: 'Quality', v: f.quality?.label },
                        { k: 'Area', v: `${f.area_km2?.toFixed(0)} km²` },
                        { k: 'Source', v: f.source },
                      ].map(({ k, v }) => (
                        <div key={k} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '4px 6px' }}>
                          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>{k}</div>
                          <div style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 600 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Heatmap dots (simplified circle markers for NDWI grid) */}
            {showHeatmap && heatmap && heatmap.features.map((f, i) => {
              const ndwi = f.properties.ndwi;
              if (ndwi <= 0.15) return null;
              const [lng, lat] = f.geometry.coordinates;
              return (
                <CircleMarker
                  key={`hm-${i}`}
                  center={[lat, lng]}
                  radius={5}
                  pathOptions={{
                    color: 'transparent',
                    fillColor: ndwiColor(ndwi),
                    fillOpacity: Math.min(0.5, ndwi * 0.7),
                    weight: 0,
                  }}
                />
              );
            })}
          </MapContainer>
        </div>

        {/* Right panel: water body detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Water body list */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '1rem',
            flex: 1,
            overflowY: 'auto',
            maxHeight: '320px',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
              Water Bodies ({filteredFeatures.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {filteredFeatures.map(f => {
                const qb  = qualityBadge(f.quality?.label);
                const isSel = selectedWb?.id === f.id;
                return (
                  <div
                    key={f.id}
                    id={`wm-wb-${f.id}`}
                    onClick={() => handleWbSelect(f)}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isSel ? 'rgba(47,129,247,0.1)' : 'transparent',
                      border: `1px solid ${isSel ? 'var(--accent-blue)' : 'transparent'}`,
                      transition: 'all 0.15s',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: isSel ? 600 : 400, color: isSel ? 'var(--accent-blue)' : 'var(--text-main)' }}>
                        {typeIcon(f.type)} {f.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {f.district} · NDWI {f.ndwi?.toFixed(3)}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '10px',
                      background: qb.bg,
                      border: `1px solid ${qb.border}`,
                      color: qb.text,
                      whiteSpace: 'nowrap',
                    }}>{f.quality?.label}</div>
                  </div>
                );
              })}
              {filteredFeatures.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>
                  No features for selected type
                </div>
              )}
            </div>
          </div>

          {/* Source info badge */}
          <div style={{
            background: 'rgba(47,129,247,0.06)',
            border: '1px solid rgba(47,129,247,0.2)',
            borderRadius: '8px',
            padding: '0.75rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
          }}>
            <Info size={14} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              <strong style={{ color: 'var(--accent-blue)' }}>Data Source:</strong> Sentinel-2 (10 m) primary · Landsat-8 fallback.
              NDWI = (Green − NIR) / (Green + NIR). Values above 0 indicate water.
              Coverage: Maharashtra — rivers, lakes, reservoirs &amp; coastline.
            </span>
          </div>
        </div>
      </div>

      {/* ── Time-Series + Monthly panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* Annual time-series */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', margin: 0 }}>Annual NDWI Time-Series</h3>
            <TrendingUp size={16} color="var(--accent-cyan)" />
          </div>
          <WaterBodyTimeSeries
            waterBodyId={selectedWb?.id}
            waterBodyName={selectedWb?.name}
          />
        </div>

        {/* Monthly breakdown */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', margin: 0 }}>Monthly Breakdown — {year}</h3>
            <BarChart3 size={16} color="var(--accent-green)" />
          </div>

          {selectedWb ? (
            <MonthlyBreakdown series={selectedSeries} year={year} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '0.5rem', color: 'var(--text-muted)' }}>
              <Globe size={32} strokeWidth={1} />
              <span style={{ fontSize: '0.85rem' }}>Select a water body to view monthly data</span>
            </div>
          )}

          {selectedWb && (
            <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              {[
                { label: 'NDWI', value: selectedWb.ndwi?.toFixed(4), color: 'var(--accent-cyan)' },
                { label: 'Area',  value: `${selectedWb.area_km2?.toFixed(0)} km²`, color: 'var(--accent-blue)' },
                { label: 'Quality', value: selectedWb.quality?.label, color: selectedWb.quality?.color || 'var(--accent-green)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.5rem', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color, marginTop: '0.1rem' }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(10,15,20,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem'
        }}>
          <Waves size={40} color="var(--accent-cyan)" style={{ animation: 'spin 2s linear infinite' }} />
          <div style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>Loading satellite data for {year}…</div>
        </div>
      )}

      {/* ── Segmentation Modal ── */}
      {segModal && (
        <SegmentationModal
          wb={segModal.wb}
          onClose={() => setSegModal(null)}
        />
      )}
    </div>
  );
}
