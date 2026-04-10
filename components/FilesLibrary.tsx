'use client';

import Link from "next/link";
import { useMemo, useState } from "react";

import type { RunFileItem } from "@/lib/runs/types";

type FilesLibraryProps = {
  runs: RunFileItem[];
};

function formatDateValue(date: string) {
  return new Date(date).toISOString().slice(0, 10);
}

export function FilesLibrary({ runs }: FilesLibraryProps) {
  const [nicheFilter, setNicheFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const nicheOptions = useMemo(() => {
    const entries = new Map<string, string>();
    runs.forEach((run) => {
      entries.set(run.niche, run.nicheName);
    });
    return [...entries.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const region = regionFilter.trim().toLowerCase();

    return runs.filter((run) => {
      if (nicheFilter !== "all" && run.niche !== nicheFilter) {
        return false;
      }

      if (region && !run.locationLabel.toLowerCase().includes(region)) {
        return false;
      }

      const runDate = formatDateValue(run.startedAt);
      if (fromDate && runDate < fromDate) {
        return false;
      }
      if (toDate && runDate > toDate) {
        return false;
      }

      return true;
    });
  }, [fromDate, nicheFilter, regionFilter, runs, toDate]);

  return (
    <div className="files-shell">
      <div className="files-header">
        <div>
          <Link href="/" className="checklist-back">
            ← Back to dashboard
          </Link>
          <h1>Scrape Files</h1>
          <p>Browse every saved scrape file, filter them, open checklist view, or download again.</p>
        </div>
        <div className="files-summary">
          <span>{filteredRuns.length} files</span>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Filters</h2>
        </div>
        <div className="files-filters">
          <label className="files-filter">
            <span>Niche</span>
            <select value={nicheFilter} onChange={(event) => setNicheFilter(event.target.value)}>
              <option value="all">All niches</option>
              {nicheOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="files-filter">
            <span>Region</span>
            <input
              type="text"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              placeholder="Search location"
            />
          </label>

          <label className="files-filter">
            <span>From date</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>

          <label className="files-filter">
            <span>To date</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Saved Files</h2>
        </div>
        <div className="files-list">
          {filteredRuns.map((run) => (
            <div key={run.id} className="file-row">
              <div className="file-main">
                <div className="file-title-row">
                  <h3>{run.nicheName}</h3>
                  <span className={`history-count ${run.status === "failed" ? "danger" : ""}`}>
                    {run.status === "failed" && run.matchingLeadCount === 0
                      ? "error"
                      : run.isPartialRun
                        ? "partial"
                        : "completed"}
                  </span>
                </div>
                <div className="file-meta">
                  <span>{run.campaignMode.replaceAll("_", " ")}</span>
                  <span>{run.locationLabel}</span>
                  <span>{run.radiusKm} km</span>
                  <span>{new Date(run.startedAt).toLocaleString()}</span>
                </div>
                <div className="file-meta">
                  <span>{run.matchingLeadCount} matching leads</span>
                  <span>Discovery: {run.discoveryCallCount}</span>
                  <span>Details: {run.detailsCallCount}</span>
                </div>
                {run.errorMessage ? <div className="file-error">Error: {run.errorMessage}</div> : null}
              </div>

              <div className="file-actions">
                <Link href={`/runs/${run.id}`} className="btn-secondary btn-linklike">
                  Open checklist
                </Link>
                <a href={`/api/runs/${run.id}/export?format=csv`} className="btn-locate">
                  Download CSV
                </a>
                <a href={`/api/runs/${run.id}/export?format=xlsx`} className="btn-secondary btn-linklike">
                  Excel
                </a>
              </div>
            </div>
          ))}

          {filteredRuns.length === 0 ? (
            <div className="empty-history">
              <span>No scrape files match these filters.</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
