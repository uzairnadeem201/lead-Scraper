'use client';

import Link from "next/link";

import type { RunSummary } from "@/lib/runs/types";

type LiveRunPanelProps = {
  run: RunSummary;
  isStopping: boolean;
  exportState: {
    loading: boolean;
    error: string;
  } | null;
  onStop: () => void;
  onDismiss: () => void;
  onExport: (format: "csv" | "xlsx") => void;
};

function getRunHeading(run: RunSummary) {
  if (run.status === "running") {
    return "Live Run";
  }
  if (run.stopReason === "user_stopped") {
    return "Run Stopped";
  }
  if (run.stopReason === "search_exhausted") {
    return "Run Completed";
  }
  if (run.stopReason === "target_reached") {
    return "Target Reached";
  }
  return "Run Completed";
}

export function LiveRunPanel({
  run,
  isStopping,
  exportState,
  onStop,
  onDismiss,
  onExport,
}: LiveRunPanelProps) {
  const progressLabel = `${run.matchingLeadCount} / ${run.targetCount} matching leads`;

  return (
    <section className="card progress-card">
      <div className="card-header">
        {run.status === "running" ? <span className="pulse-dot"></span> : null}
        <h2>{getRunHeading(run)}</h2>
      </div>
      <p className="card-desc">
        {run.currentPhase
          ? `Phase: ${run.currentPhase.replaceAll("_", " ")}`
          : "Run summary"}
        {run.currentTerm ? ` · Term: ${run.currentTerm}` : ""}
      </p>
      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{
            width: `${Math.min((run.matchingLeadCount / Math.max(run.targetCount, 1)) * 100, 100)}%`,
          }}
        ></div>
      </div>
      <div className="progress-stats">
        <div className="stat">
          <span className="stat-value">{run.discoveredCount}</span>
          <span className="stat-label">Discovered</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-leads">{run.matchingLeadCount}</span>
          <span className="stat-label">Matching</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-dup">{run.duplicatesSkipped}</span>
          <span className="stat-label">Duplicates</span>
        </div>
      </div>
      <div className="run-summary-stack">
        <div>{progressLabel}</div>
        <div>
          Discovery calls: {run.discoveryCallCount} · Details calls: {run.detailsCallCount}
        </div>
        {run.stopReason ? <div>Stop reason: {run.stopReason.replaceAll("_", " ")}</div> : null}
        {run.errorMessage ? <div>Error: {run.errorMessage}</div> : null}
      </div>
      {run.preview.length > 0 ? (
        <>
          <div className="subsection-title">
            <h3>Top Leads (showing {run.preview.length})</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Business</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>Social</th>
                  <th>Reputation</th>
                </tr>
              </thead>
              <tbody>
                {run.preview.map((lead, index) => (
                  <tr key={lead.id}>
                    <td>{lead.rank ?? index + 1}</td>
                    <td>{lead.businessName}</td>
                    <td>{lead.phoneDisplay || "—"}</td>
                    <td>
                      <span className="status-badge">{lead.classification.replaceAll("_", " ")}</span>
                    </td>
                    <td>{lead.socialPlatform || "—"}</td>
                    <td>
                      {lead.rating ? `${lead.rating.toFixed(1)} · ${lead.totalReviews}` : `— · ${lead.totalReviews}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <div className="run-actions">
        {run.status === "running" ? (
          <button className="btn-locate" onClick={onStop} disabled={isStopping}>
            {isStopping ? "Stopping..." : "Stop Run"}
          </button>
        ) : null}
        {run.status !== "running" ? (
          <>
            <Link className="btn-secondary btn-linklike" href={`/runs/${run.id}`}>
              Open checklist
            </Link>
            <button
              className="btn-locate"
              onClick={() => onExport("csv")}
              disabled={exportState?.loading}
            >
              {exportState?.loading ? "Downloading..." : "Download CSV"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => onExport("xlsx")}
              disabled={exportState?.loading}
            >
              Excel
            </button>
          </>
        ) : null}
        {run.status !== "running" ? (
          <button className="btn-locate" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
      {exportState?.error ? <p style={{ color: "var(--error)" }}>{exportState.error}</p> : null}
    </section>
  );
}
