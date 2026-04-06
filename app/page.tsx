'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSession, signIn, signOut } from 'next-auth/react';
import { NICHES, classifyWebsite, generateGridPoints, proxyFetch, sleep, downloadExcel } from '@/lib/scraper';
import { getScrapeHistory, saveScrapeSession, getKnownPlaceIds } from '@/lib/actions';
import { LogOut, LogIn, User, Lock, Trash2, MapPin, Search, Play, CheckCircle, AlertCircle, History } from 'lucide-react';

const MapComponent = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Page() {
  const { data: session, status } = useSession();
  const [locationStr, setLocationStr] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState('no_website');
  
  // History from DB
  const [historySessions, setHistorySessions] = useState<any[]>([]);
  const [knownPlaceIds, setKnownPlaceIds] = useState<Set<string>>(new Set());
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
  
  // Auth Form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Load history when session is available or niche changes
  const loadHistory = useCallback(async () => {
    if (status !== 'authenticated') return;
    
    try {
      const data = await getScrapeHistory();
      setHistorySessions(data);
      
      const ids = await getKnownPlaceIds();
      setKnownPlaceIds(ids);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, [status]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    
    setIsLoggingIn(true);
    setAuthError('');
    
    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false
      });
      
      if (result?.error) {
        setAuthError('Invalid username or password');
      } else {
        setUsername('');
        setPassword('');
      }
    } catch (err) {
      setAuthError('An error occurred during login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Update map points based on history and selected niche
  useEffect(() => {
    const filtered = selectedNiche 
      ? historySessions.filter(s => s.niche === selectedNiche)
      : historySessions;

    const mapPts = filtered.map((s: any) => ({
      lat: s.lat, 
      lng: s.lng, 
      radius_km: s.radiusKm, 
      title: `${NICHES[s.niche]?.name || s.niche} - ${new Date(s.createdAt).toLocaleDateString()}`
    }));
    setMapHistoryPoints(mapPts);
  }, [historySessions, selectedNiche]);

  const appendLog = (msg: string) => setLogs(prev => [...prev, msg].slice(-20));

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
    if (!lat || !lng || !selectedNiche || status !== 'authenticated') return;

    setIsRunning(true);
    setErrorMessage('');
    setResults([]);
    setLogs([]);
    setProgressPct(0);
    setStatFound(0);
    setStatLeads(0);
    setStatDups(0);

    const niche = NICHES[selectedNiche];
    
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
        for (let p = 0; p < 3; p++) {
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
        setProgressPct(Math.round((pCount / totalDiscoverySteps) * 30));
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
      const newIds = discoveredIds.filter(pid => !knownPlaceIds.has(pid));
      const dupIds = discoveredIds.filter(pid => knownPlaceIds.has(pid));
      
      setStatDups(dupIds.length);
      appendLog(`Found ${discoveredIds.length} places — ${newIds.length} new, ${dupIds.length} already scraped`);

      // 3. Details Phase
      setPhaseTitle("📋 Getting Details (new only)...");
      const allRes: any[] = [];
      const leadsForDb: any[] = [];

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
              place_id: pid,
           };
           allRes.push(row);
           leadsForDb.push(row);
           
           if (filterMode === 'no_website' && !row.has_website) setStatLeads(prev => prev + 1);
           if (filterMode === 'with_website' && row.has_website) setStatLeads(prev => prev + 1);
           if (filterMode === 'all') setStatLeads(allRes.length);
        }

        setProgressPct(30 + Math.round(((i + 1) / newIds.length) * 60));
        if ((i + 1) % 10 === 0) appendLog(`Details: ${i+1}/${newIds.length}`);
        await sleep(100);
      }

      setPhaseTitle("💾 Saving to Database...");
      setProgressPct(95);

      // Save to DB
      await saveScrapeSession({
        niche: selectedNiche,
        location: locationStr || "Map Area",
        lat,
        lng,
        radiusKm,
        leadsData: leadsForDb
      });

      // Reload global history
      await loadHistory();

      // Filter and Export Setup
      let filtered = [...allRes];
      if (filterMode === 'no_website') filtered = allRes.filter(r => !r.has_website);
      if (filterMode === 'with_website') filtered = allRes.filter(r => r.has_website);
      filtered.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));

      setResults(filtered);
      setProgressPct(100);
      setPhaseTitle("✅ Complete!");
      
      const filename = `leads_${selectedNiche}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.xlsx`;
      downloadExcel(filtered, allRes, niche.name, locationStr || "Map Area", radiusKm, newIds.length, dupIds.length, filename);
      
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during scraping');
    } finally {
      setIsRunning(false);
    }
  };

  const hasLocation = lat !== null;
  const isReady = hasLocation && selectedNiche && status === 'authenticated';

  return (
    <>
    <div className="bg-glow bg-glow-1"></div>
    <div className="bg-glow bg-glow-2"></div>
    
    {status === 'unauthenticated' ? (
      <div className="login-gate">
        <div className="login-gate-content">
          <div className="logo centered">
             <span className="logo-icon">⚡</span>
             <h1>LeadScraper <span className="pro">Pro</span></h1>
          </div>
          <div className="card login-card">
            <div className="card-header">
              <h2>Welcome Back</h2>
            </div>
            <p className="card-desc">Enter your account credentials to access the scraper dashboard.</p>
            
            <form className="login-gate-form" onSubmit={handleCredentialsLogin}>
              <div className="input-group">
                <span className="input-icon"><User size={20} /></span>
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
                  required
                />
              </div>
              
              <div className="input-group">
                <span className="input-icon"><Lock size={20} /></span>
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required
                />
              </div>

              {authError && <div className="auth-error-msg gate-error">{authError}</div>}
              
              <button type="submit" className="btn-start" disabled={isLoggingIn}>
                <span className="btn-text">{isLoggingIn ? 'Verifying...' : 'Sign In to Portal'}</span>
              </button>
            </form>
          </div>
          <p className="login-footer">Private System &copy; 2026 LeadScraper Pro</p>
        </div>
      </div>
    ) : (
      <div className="container">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <h1>LeadScraper <span className="pro">Pro</span></h1>
          </div>
          <p className="tagline">Find local businesses on Google Maps <em>without websites</em>.</p>
        </div>
        
        <div className="header-right">
          {status === 'authenticated' && (
            <div className="user-profile">
              <div className="user-info">
                <span className="user-name">{session.user?.name || session.user?.username || "Admin"}</span>
                <span className="user-status">System Active</span>
              </div>
              <button className="btn-logout" onClick={() => signOut()}>
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Step 1: Niche */}
      <section className="card">
        <div className="card-header">
          <span className="step-badge">1</span>
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

      {/* Step 2: Location & Map */}
      <section className="card">
        <div className="card-header">
          <span className="step-badge">2</span>
          <h2>Location & Radius</h2>
        </div>
        <p className="card-desc">Type a city or <strong>click on the map</strong> to set your search center.</p>
        <div className="location-row">
          <div className="input-group" style={{flex: 1}}>
            <span className="input-icon"><MapPin size={18} /></span>
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
          {lat !== null && lng !== null ? <span className="coords">Center: {lat.toFixed(4)}, {lng.toFixed(4)} — Drag pin to adjust</span> : <span>Click the map or search a location</span>}
        </div>
        <div className="radius-control">
          <div className="radius-header">
            <label>Search Radius</label>
            <span className="radius-value">{radiusKm} km</span>
          </div>
          <input type="range" min="1" max="100" step="1" value={radiusKm} onChange={e => setRadiusKm(parseInt(e.target.value))} disabled={isRunning} />
        </div>
      </section>

      {/* NEW: Scrape History Section (Moved Up) */}
      {status === 'authenticated' && (
        <section className="card history-card">
          <div className="card-header">
            <span className="step-badge icon"><History size={18} /></span>
            <h2>Regional Coverage</h2>
            {selectedNiche && <span className="meta-badge purple">{NICHES[selectedNiche].name}</span>}
          </div>
          <p className="card-desc">
            {selectedNiche 
              ? `Showing coverage areas specifically for ${NICHES[selectedNiche].name}.`
              : "Showing all your historical coverage across all niches."}
          </p>
          <div className="history-list min-h-[100px]">
            {historySessions.filter(s => !selectedNiche || s.niche === selectedNiche).length > 0 ? (
              historySessions
                .filter(s => !selectedNiche || s.niche === selectedNiche)
                .slice(0, 5)
                .map((s, idx) => (
                  <div className="history-item" key={idx}>
                    <span className="history-icon">{NICHES[s.niche]?.icon || '📍'}</span>
                    <div className="history-info">
                      <div className="h-title">{s.location}</div>
                      <div className="h-meta">{new Date(s.createdAt).toLocaleDateString()} · {s.radiusKm}km radius</div>
                    </div>
                    <span className="history-count">Session</span>
                  </div>
                ))
            ) : (
              <div className="empty-history">
                <AlertCircle size={20} />
                <span>No history found for {selectedNiche ? NICHES[selectedNiche].name : "any niche"}.</span>
              </div>
            )}
            {historySessions.length > 5 && <div className="history-more">And {historySessions.length - 5} more sessions...</div>}
          </div>
        </section>
      )}


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
        <span className="btn-sub">Deduplication is active — skipping results found in your history</span>
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
              <p>{results.length} leads — showing top {Math.min(results.length, 100)}</p>
            </div>
            <button className="btn-download" onClick={() => {
                const nicheName = selectedNiche ? NICHES[selectedNiche]?.name : "Leads";
                downloadExcel(results, results, nicheName, locationStr || "Map Area", radiusKm, results.length, statDups, `leads_${selectedNiche}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.xlsx`);
            }}>📥 Download Excel</button>
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
      </div>
    )}
    </>
  );
}
