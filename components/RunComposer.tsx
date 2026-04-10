'use client';

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { NICHES, type CampaignMode } from "@/lib/config/scraper";

const MapComponent = dynamic(() => import("@/components/Map"), { ssr: false });

type HistoryPoint = {
  lat: number;
  lng: number;
  radius_km: number;
  title: string;
};

type RunComposerProps = {
  locationLabel: string;
  setLocationLabel: (value: string) => void;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  setRadiusKm: (value: number) => void;
  selectedNiche: string | null;
  setSelectedNiche: (value: string) => void;
  campaignMode: CampaignMode;
  setCampaignMode: (value: CampaignMode) => void;
  onLocate: () => Promise<void>;
  onPositionChange: (lat: number, lng: number) => void;
  onStart: () => Promise<void>;
  isStarting: boolean;
  historyPoints: HistoryPoint[];
  disableActions: boolean;
};

export function RunComposer({
  locationLabel,
  setLocationLabel,
  lat,
  lng,
  radiusKm,
  setRadiusKm,
  selectedNiche,
  setSelectedNiche,
  campaignMode,
  setCampaignMode,
  onLocate,
  onPositionChange,
  onStart,
  isStarting,
  historyPoints,
  disableActions,
}: RunComposerProps) {
  const isReady = lat !== null && lng !== null && selectedNiche !== null;

  return (
    <>
      <section className="card">
        <div className="card-header">
          <span className="step-badge">1</span>
          <h2>Select Niche</h2>
        </div>
        <div className="niche-grid">
          {Object.entries(NICHES).map(([key, niche]) => (
            <button
              key={key}
              className={`niche-card ${selectedNiche === key ? "selected" : ""}`}
              onClick={() => setSelectedNiche(key)}
              disabled={disableActions}
            >
              <span className="niche-icon">{niche.icon}</span>
              <span className="niche-name">{niche.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <span className="step-badge">2</span>
          <h2>Location & Radius</h2>
        </div>
        <p className="card-desc">Type a city or click on the map to choose the search center.</p>
        <div className="location-row">
          <div className="input-group" style={{ flex: 1 }}>
            <span className="input-icon">
              <MapPin size={18} />
            </span>
            <input
              type="text"
              placeholder="e.g. Atlanta, GA"
              value={locationLabel}
              onChange={(event) => setLocationLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onLocate();
                }
              }}
            />
          </div>
          <button className="btn-locate" onClick={() => void onLocate()} disabled={disableActions}>
            Find on Map
          </button>
        </div>
        <div className="map-container">
          <MapComponent
            lat={lat}
            lng={lng}
            radiusKm={radiusKm}
            onPositionChange={onPositionChange}
            historyPoints={historyPoints}
          />
        </div>
        <div className="map-hint">
          {lat !== null && lng !== null ? (
            <span className="coords">
              Center: {lat.toFixed(4)}, {lng.toFixed(4)}
            </span>
          ) : (
            <span>Click the map or search a location</span>
          )}
        </div>
        <div className="radius-control">
          <div className="radius-header">
            <label>Search Radius</label>
            <span className="radius-value">{radiusKm} km</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            value={radiusKm}
            onChange={(event) => setRadiusKm(Number.parseInt(event.target.value, 10))}
            disabled={disableActions}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <span className="step-badge">3</span>
          <h2>Campaign Mode</h2>
        </div>
        <div className="filter-options">
          <label className={`filter-option ${campaignMode === "without_website" ? "selected" : ""}`}>
            <input
              type="radio"
              checked={campaignMode === "without_website"}
              onChange={() => setCampaignMode("without_website")}
              disabled={disableActions}
            />
            <span className="filter-radio"></span>
            <div className="filter-text">
              <span className="filter-title">Without website</span>
            </div>
          </label>
          <label className={`filter-option ${campaignMode === "with_website" ? "selected" : ""}`}>
            <input
              type="radio"
              checked={campaignMode === "with_website"}
              onChange={() => setCampaignMode("with_website")}
              disabled={disableActions}
            />
            <span className="filter-radio"></span>
            <div className="filter-text">
              <span className="filter-title">With website</span>
            </div>
          </label>
        </div>
      </section>

      <button className="btn-start" onClick={() => void onStart()} disabled={!isReady || disableActions}>
        <span className="btn-text">{isStarting ? "Starting..." : "Start Server Run"}</span>
        <span className="btn-sub">Server-side staged discovery with niche-specific dedupe</span>
      </button>
    </>
  );
}
