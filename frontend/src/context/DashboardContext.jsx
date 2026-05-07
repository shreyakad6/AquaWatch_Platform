import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:8000';
const DashboardContext = createContext();

export function DashboardProvider({ children }) {
  const [rivers, setRivers] = useState([]);
  const [selectedRiver, setSelectedRiver] = useState('');
  
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [spectral, setSpectral] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [cache, setCache] = useState({});

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        setLoading(true);
        const [riversRes, alertsRes, spectralRes] = await Promise.all([
          axios.get(`${BACKEND_URL}/api/rivers`),
          axios.get(`${BACKEND_URL}/api/alerts`),
          axios.get(`${BACKEND_URL}/api/spectral`)
        ]);
        
        setRivers(riversRes.data);
        setAlerts(alertsRes.data);
        setSpectral(spectralRes.data);
        
        if (riversRes.data.length > 0) {
          setSelectedRiver(riversRes.data[0]);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Error fetching initial data", err);
        setError("Failed to load dashboard data. Ensure backend is running.");
        setLoading(false);
      }
    };
    fetchInitial();
  }, []);

  useEffect(() => {
    if (!selectedRiver) return;
    
    if (cache[selectedRiver]) {
      setData(cache[selectedRiver]);
      setLoading(false);
      return;
    }

    const fetchRiverData = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${BACKEND_URL}/api/stations?river=${encodeURIComponent(selectedRiver)}`);
        
        setData(res.data);
        setCache(prev => ({ ...prev, [selectedRiver]: res.data }));
      } catch (err) {
        console.error("Error fetching river data", err);
        setError(`Failed to load data for ${selectedRiver}.`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRiverData();
  }, [selectedRiver]); // Remove cache from deps to avoid loop

  return (
    <DashboardContext.Provider value={{
      rivers,
      selectedRiver,
      setSelectedRiver,
      data,
      alerts,
      spectral,
      loading,
      error
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
