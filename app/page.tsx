'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { NICHES, classifyWebsite, generateGridPoints, proxyFetch, sleep, downloadExcel } from '@/lib/scraper';

const MapComponent = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Page() {
  const [locationStr, setLocationStr] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState('no_website');
  
  const [history, setHistory] = useState<{ scraped_ids: Record<string, any>, sessions: any[] }>({ scraped_ids: {}, sessions: [] });
  const [mapHistoryPoints, setMapHistoryPoints] = useState<any[]>([]);

  // Progress UI
  const [isRunning, setIsRunning] = useState(false);
  const [phaseTitle, setPhaseTitle] = useState('Starting...');
  const [progressPct, setProgressPct] = useState(0);
  const [statFound, setStatFound] = useState(0);
  const [statLeads, setStatLeads] = useState(0);
  const [statDups, setStatDups] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [results, setResults] = useState<any[]>([]);

  // On mount load history
  useEffect(() => {
    try {
      const h = localStorage.getItem('scrape_history');
      if (h) {
        const parsed = JSON.parse(h);
        setHistory(parsed);
        const mapPts = parsed.sessions.map((s: any) => ({
          lat: s.lat, lng: s.lng, radius_km: s.radius_km, title: `${s.niche_name} - ${s.date}`
        }));
        setMapHistoryPoints(mapPts);
      }
    } catch {}
  }, []);

  const saveHistory = (newHistory: any) => {
    setHistory(newHistory);
    localStorage.setItem('scrape_history', JSON.stringify(newHistory));
    const mapPts = newHistory.sessions.map((s: any) => ({
      lat: s.lat, lng: s.lng, radius_km: s.radius_km, title: `${s.niche_name} - ${s.date}`
    }));
    setMapHistoryPoints(mapPts);
  };

  const clearHistory = () => {
    if (confirm("Clear all scrape history? This will reset deduplication.")) {
      saveHistory({ scraped_ids: {}, sessions: [] });
    }
  };

  const appendLog = (msg: string) => setLogs(prev => [...prev, msg].slice(-20)); // keep last 20

  const handleLocate = async () => {
    if (!locationStr) return;
    try {
      const data = await proxyFetch('geocode/json', { address: locationStr });
      if (data.results && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        setLat(loc.lat);
        setLng(loc.lng);
      } else {
        alert("Location not found");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const startScrape = async () => {
    if (!lat || !lng || !selectedNiche) return;

    setIsRunning(true);
    setErrorMessage('');
    setResults([]);
    setLogs([]);
    setProgressPct(0);
    setStatFound(0);
    setStatLeads(0);
    setStatDups(0);

    const niche = NICHES[selectedNiche];
    const knownIds = new Set(Object.keys(history.scraped_ids || {}));
    
    try {
      setPhaseTitle("🔍 Discovering Businesses...");
      appendLog(`Locating ${locationStr || "clicked map"} — ${radiusKm}km radius`);

      const pts = generateGridPoints(lat, lng, radiusKm);
      const searchRadiusM = Math.min(Math.max(Math.floor((radiusKm * 1000) / 2.5), 500), 50000);
      const allP: Record<string, any> = {};

      const totalDiscoverySteps = niche.terms.length + pts.length * Math.max(niche.types.length, 1);
      let pCount = 0;

      // 1. Text Search Sweep
      for (const term of niche.terms) {
        appendLog(`Text search: "${term}"`);
        let pageToken = '';
        for (let p = 0; p < 3; p++) { // max 3 pages
          const res: any = await proxyFetch('place/textsearch/json', {
            query: term,
            location: `${lat},${lng}`,
            radius: Math.min(radiusKm * 1000, 50000),
            pagetoken: pageToken || undefined
          });
          const results = res.results || [];
          results.forEach((r: any) => { if (r.place_id) allP[r.place_id] = r; });
          setStatFound(Object.keys(allP).length);
          if (res.next_page_token) {
            pageToken = res.next_page_token;
            await sleep(2000);
          } else break;
        }
        pCount++;
        setProgressPct(Math.round((pCount / totalDiscoverySteps) * 30)); // First 30% is discovery
      }

      // 2. Grid Nearby Search Sweep
      appendLog(`Grid search across ${pts.length} areas...`);
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (niche.types && niche.types.length > 0) {
          for (const tp of niche.types) {
            let pageToken = '';
            for (let p=0; p<2; p++) {
              const res: any = await proxyFetch('place/nearbysearch/json', {
                location: `${pt.lat},${pt.lng}`, radius: searchRadiusM, type: tp, pagetoken: pageToken || undefined
              });
              (res.results || []).forEach((r: any) => { if (r.place_id) allP[r.place_id] = r; });
              if (res.next_page_token) { pageToken = res.next_page_token; await sleep(2000); } else break;
            }
          }
        } else {
             let pageToken = '';
             for (let p=0; p<2; p++) {
              const res: any = await proxyFetch('place/nearbysearch/json', {
                location: `${pt.lat},${pt.lng}`, radius: searchRadiusM, keyword: niche.terms[0], pagetoken: pageToken || undefined
              });
              (res.results || []).forEach((r: any) => { if (r.place_id) allP[r.place_id] = r; });
              if (res.next_page_token) { pageToken = res.next_page_token; await sleep(2000); } else break;
            }
        }
        pCount++;
        setProgressPct(Math.round((pCount / totalDiscoverySteps) * 30));
        setStatFound(Object.keys(allP).length);
      }

      // Deduplication Phase
      const discoveredIds = Object.keys(allP);
      const newIds = discoveredIds.filter(pid => !knownIds.has(pid));
      const dupIds = discoveredIds.filter(pid => knownIds.has(pid));
      
      setStatDups(dupIds.length);
      appendLog(`Found ${discoveredIds.length} places — ${newIds.length} new, ${dupIds.length} already scraped`);

      // 3. Details Phase
      setPhaseTitle("📋 Getting Details (new only)...");
      const allRes: any[] = [];
      for (let i = 0; i < newIds.length; i++) {
        const pid = newIds[i];
        const info = allP[pid];
        
        const dRes: any = await proxyFetch('place/details/json', {
          place_id: pid,
          fields: "name,formatted_address,formatted_phone_number,website,url,rating,user_ratings_total,business_status"
        });
        const d = dRes.result || {};

        if (d.business_status !== "CLOSED_PERMANENTLY") {
           const rawWebsite = d.website || "";
           const classified = classifyWebsite(rawWebsite);

           const row = {
              business_name: d.name || info.name || "",
              address: d.formatted_address || "",
              phone: d.formatted_phone_number || "",
              website: classified.website,
              has_website: !!classified.website,
              has_website_label: classified.website ? "Yes" : "No",
              social_link: classified.social,
              social_platform: classified.social_platform,
              rating: d.rating || "",
              total_reviews: d.user_ratings_total || 0,
              google_maps_url: d.url || "",
           };
           allRes.push(row);
           
           if (filterMode === 'no_website' && !row.has_website) setStatLeads(prev => prev + 1);
           if (filterMode === 'with_website' && row.has_website) setStatLeads(prev => prev + 1);
           if (filterMode === 'all') setStatLeads(allRes.length);
        }

        setProgressPct(30 + Math.round(((i + 1) / newIds.length) * 60)); // Discovery 30%, Details 60%
        if ((i + 1) % 10 === 0) appendLog(`Details: ${i+1}/${newIds.length}`);
        await sleep(100);
      }

      setPhaseTitle("💾 Finalizing & Creating Excel...");
      setProgressPct(95);

      // Save History
      const newHistory = { ...history };
      const now = new Date().toLocaleString();
      newIds.forEach(pid => {
        newHistory.scraped_ids[pid] = { niche: selectedNiche, date: now };
      });
      newHistory.sessions.push({
        date: now, niche: selectedNiche, niche_name: niche.name,
        location: locationStr || "Map Drop", radius_km: radiusKm,
        lat, lng, total_discovered: discoveredIds.length,
        new_leads: allRes.length, duplicates_skipped: dupIds.length
      });
      saveHistory(newHistory);

      // Filter and Export Setup
      let filtered = [...allRes];
      if (filterMode === 'no_website') filtered = allRes.filter(r => !r.has_website);
      if (filterMode === 'with_website') filtered = allRes.filter(r => r.has_website);
      filtered.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));

      setResults(filtered);
      setProgressPct(100);
      setPhaseTitle("✅ Complete!");
      
      const filename = `leads_${selectedNiche}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.xlsx`;
      
      // Auto Download
      downloadExcel(filtered, allRes, niche.name, locationStr || "Map Area", radiusKm, newIds.length, dupIds.length, filename);
      
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during scraping');
    } finally {
      setIsRunning(false);
    }
  };

  const hasLocation = lat !== null;
  const isReady = hasLocation && selectedNiche;

  return (
    <>
    <div className="bg-glow bg-glow-1"></div>
    <div className="bg-glow bg-glow-2"></div>
    <div className="container">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <h1>LeadScraper <span className="pro">Pro</span></h1>
        </div>
        <p className="tagline">Find local businesses on Google Maps <em>without websites</em> — your next clients.</p>
      </header>

      {/* Location & Map */}
      <section className="card">
        <div className="card-header">
          <span className="step-badge">1</span>
          <h2>Location & Radius</h2>
        </div>
        <p className="card-desc">Type a city or <strong>click on the map</strong> to set your search center.</p>
        <div className="location-row">
          <div className="input-group" style={{flex: 1}}>
            <span className="input-icon">📍</span>
            <input 
               type="text" 
               placeholder="e.g. Atlanta, GA" 
               value={locationStr} 
               onChange={e => setLocationStr(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && handleLocate()}
            />
          </div>
          <button className="btn-locate" onClick={handleLocate} disabled={isRunning}>Find on Map</button>
        </div>
        <div className="map-container">
          <MapComponent 
            lat={lat} lng={lng} radiusKm={radiusKm} 
            onPositionChange={(lt, lg) => { setLat(lt); setLng(lg); }}
            historyPoints={mapHistoryPoints}
          />
        </div>
        <div className="map-hint">
          {lat !== null ? <span className="coords">Center: {lat.toFixed(4)}, {lng.toFixed(4)} — Drag pin to adjust</span> : <span>Click the map or search a location</span>}
        </div>
        <div className="radius-control">
          <div className="radius-header">
            <label>Search Radius</label>
            <span className="radius-value">{radiusKm} km</span>
          </div>
          <input type="range" min="1" max="100" step="1" value={radiusKm} onChange={e => setRadiusKm(parseInt(e.target.value))} disabled={isRunning} />
        </div>
      </section>

      {/* Niche */}
      <section className="card">
        <div className="card-header">
          <span className="step-badge">2</span>
          <h2>Select Niche</h2>
        </div>
        <div className="niche-grid">
          {Object.entries(NICHES).map(([key, n]) => (
            <button 
               key={key} 
               className={`niche-card ${selectedNiche === key ? 'selected' : ''}`}
               onClick={() => !isRunning && setSelectedNiche(key)}
               disabled={isRunning}
            >
              <span className="niche-icon">{n.icon}</span>
              <span className="niche-name">{n.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Filter */}
      <section className="card">
        <div className="card-header">
          <span className="step-badge">3</span>
          <h2>Filter Results</h2>
        </div>
        <div className="filter-options">
          <label className={`filter-option ${filterMode === 'no_website' ? 'selected' : ''}`}>
            <input type="radio" checked={filterMode === 'no_website'} onChange={() => setFilterMode('no_website')} disabled={isRunning}/>
            <span className="filter-radio"></span>
            <div className="filter-text">
              <span className="filter-title">🚫 Without a website</span>
            </div>
          </label>
          <label className={`filter-option ${filterMode === 'with_website' ? 'selected' : ''}`}>
            <input type="radio" checked={filterMode === 'with_website'} onChange={() => setFilterMode('with_website')} disabled={isRunning}/>
            <span className="filter-radio"></span>
            <div className="filter-text"><span className="filter-title">🌐 With a website</span></div>
          </label>
        </div>
      </section>

      <button className="btn-start" onClick={startScrape} disabled={!isReady || isRunning}>
        <span className="btn-text">{isRunning ? 'Running...' : '🚀 Start Scraping'}</span>
        <span className="btn-sub">Only NEW leads are fetched — duplicates are automatically skipped</span>
      </button>

      {/* Progress */}
      { (isRunning || progressPct > 0 || errorMessage) && (
        <section className={`card progress-card ${errorMessage ? 'error-card' : ''}`}>
          <div className="card-header">
            {!errorMessage && <span className="pulse-dot"></span>}
            <h2>{errorMessage ? '❌ Error' : phaseTitle}</h2>
          </div>
          {errorMessage ? (
            <p style={{color: 'var(--error)'}}>{errorMessage}</p>
          ) : (
            <>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{width: `${progressPct}%`}}></div>
              </div>
              <div className="progress-stats">
                <div className="stat"><span className="stat-value">{statFound}</span><span className="stat-label">Discovered</span></div>
                <div className="stat"><span className="stat-value stat-leads">{statLeads}</span><span className="stat-label">New Leads</span></div>
                <div className="stat"><span className="stat-value stat-dup">{statDups}</span><span className="stat-label">Duplicates Skipped</span></div>
              </div>
              <div className="progress-log">
                {logs.map((L, idx) => <div key={idx} className="log-line">→ {L}</div>)}
              </div>
            </>
          )}
        </section>
      )}
      {/* Results */}
      {results && results.length > 0 && !isRunning && progressPct === 100 && (
        <section className="card results-card" id="resultsSection">
          <div className="results-header">
            <div>
              <h2>🎯 Results</h2>
              <p>{results.length} {filterMode === 'no_website' ? 'without a website' : filterMode === 'with_website' ? 'with a website' : 'total'} — showing top {Math.min(results.length, 100)}</p>
            </div>
            <button className="btn-download" onClick={() => {
                const nicheName = selectedNiche ? NICHES[selectedNiche]?.name : "Leads";
                downloadExcel(results, results, nicheName, locationStr || "Map Area", radiusKm, results.length, statDups, `leads_${selectedNiche}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.xlsx`);
            }}>📥 Download Excel again</button>
          </div>
          <div className="results-meta">
            <span className="meta-badge green">✅ {statLeads} new leads</span>
            <span className="meta-badge yellow">🔁 {statDups} duplicates skipped</span>
          </div>
          <div className="table-wrap">
            <table id="resultsTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Business Name</th>
                  <th>Phone</th>
                  <th>Social</th>
                  <th>Rating</th>
                  <th>Reviews</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td title={r.business_name}>{r.business_name}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.social_platform ? <span className="social-badge">{r.social_platform}</span> : '—'}</td>
                    <td>{r.rating ? `⭐ ${r.rating}` : '—'}</td>
                    <td>{r.total_reviews || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* History */}
      <section className="card history-card">
        <div className="card-header">
          <h2>📋 Scrape History</h2>
          <button className="btn-clear" onClick={clearHistory}>Clear All</button>
        </div>
        <div className="history-summary">
          {Object.keys(history.scraped_ids).length > 0 
            ? <><strong>{Object.keys(history.scraped_ids).length}</strong> unique businesses scraped across {history.sessions.length} session(s)</>
            : "No scrapes yet. Start your first one above!"}
        </div>
        <div className="history-list">
          {history.sessions.slice().reverse().map((s, idx) => (
             <div className="history-item" key={idx}>
                <span className="history-icon">📍</span>
                <div className="history-info">
                  <div className="h-title">{s.niche_name} in {s.location}</div>
                  <div className="h-meta">{s.date} · {s.radius_km}km radius</div>
                </div>
                <span className="history-count">+{s.new_leads} new</span>
             </div>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
