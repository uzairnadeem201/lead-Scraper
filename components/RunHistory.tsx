'use client';

import Link from "next/link";
import { useState } from "react";
import type { RunSummary } from "@/lib/runs/types";

type RunHistoryProps = {
  runs: RunSummary[];
  onRefreshRun: (runId: string) => Promise<RunSummary | null>;
  exportStateByRunId: Record<string, { loading: boolean; error: string } | undefined>;
  onExportRun: (runId: string, format: "csv" | "xlsx") => void;
};

export function RunHistory({
  runs,
  onRefreshRun,
  exportStateByRunId,
  onExportRun,
}: RunHistoryProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<RunSummary | null>(null);

  async function toggleRun(run: RunSummary) {
    if (expandedRunId === run.id) {
      setExpandedRunId(null);
      setExpandedRun(null);
      return;
    }

    setExpandedRunId(run.id);
    const detail = await onRefreshRun(run.id);
    setExpandedRun(detail);
  }

  return (
    <section className="card history-card">
      <div className="card-header">
        <h2>Run History</h2>
      </div>
      <div className="history-list">
        {runs.map((run) => {
          const isExpanded = expandedRunId === run.id && expandedRun?.id === run.id;
          const detail = isExpanded ? expandedRun : run;
          const exportState = exportStateByRunId[run.id];

          return (
            <div key={run.id} className="history-run-card">
              <button className="history-item history-item-button" onClick={() => toggleRun(run)}>
                <div className="history-info">
                  <div className="h-title">
                    {run.nicheName} · {run.campaignMode.replaceAll("_", " ")}
                  </div>
                  <div className="h-meta">
                    {run.locationLabel} · {run.radiusKm}km
                  </div>
                  <div className="h-meta">
                    {new Date(run.startedAt).toLocaleString()} · {run.stopReason?.replaceAll("_", " ") || run.status}
                  </div>
                  <div className="h-meta">
                    Discovery calls: {run.discoveryCallCount} · Details calls: {run.detailsCallCount} ·
                    Match/details: {run.detailsEfficiency?.toFixed(2) ?? "—"} · Match/discovery:{" "}
                    {run.discoveryEfficiency?.toFixed(2) ?? "—"}
                  </div>
                  {run.errorMessage ? <div className="h-meta">Error: {run.errorMessage}</div> : null}
                </div>
                <span className={`history-count ${run.status === "failed" ? "danger" : ""}`}>
                  {run.status === "failed" && run.matchingLeadCount === 0
                    ? "error"
                    : run.isPartialRun
                      ? "partial"
                      : "completed"}
                </span>
              </button>
              {isExpanded && detail ? (
                <div className="history-run-expanded">
                  <div className="run-summary-stack">
                    <div>
                      {detail.nicheName} · {detail.campaignMode.replaceAll("_", " ")} · {detail.locationLabel} ·{" "}
                      {detail.radiusKm}km
                    </div>
                    <div>
                      Stop reason: {detail.stopReason?.replaceAll("_", " ") || detail.status} · Discovery calls:{" "}
                      {detail.discoveryCallCount} · Details calls: {detail.detailsCallCount}
                    </div>
                    {detail.errorMessage ? <div>Error: {detail.errorMessage}</div> : null}
                    {detail.isPartialRun ? <div>This run was partial and still saved usable results.</div> : null}
                  </div>
                  <div className="run-actions">
                    <Link className="btn-secondary btn-linklike" href={`/runs/${detail.id}`}>
                      Open checklist
                    </Link>
                    <button
                      className="btn-locate"
                      onClick={() => onExportRun(detail.id, "csv")}
                      disabled={exportState?.loading}
                    >
                      {exportState?.loading ? "Downloading..." : "Download CSV"}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => onExportRun(detail.id, "xlsx")}
                      disabled={exportState?.loading}
                    >
                      Excel
                    </button>
                  </div>
                  {exportState?.error ? (
                    <p style={{ color: "var(--error)" }}>{exportState.error}</p>
                  ) : null}
                  {detail.preview.length > 0 ? (
                    <>
                      <div className="subsection-title">
                        <h3>
                          Top Leads (showing {detail.preview.length} of {detail.matchingLeadCount})
                        </h3>
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
                            {detail.preview.map((lead, index) => (
                              <tr key={lead.id}>
                                <td>{lead.rank ?? index + 1}</td>
                                <td>
                                  {lead.googleMapsUrl ? (
                                    <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer">
                                      {lead.businessName}
                                    </a>
                                  ) : (
                                    lead.businessName
                                  )}
                                </td>
                                <td>{lead.phoneDisplay || "—"}</td>
                                <td>
                                  <span className="status-badge">
                                    {lead.classification.replaceAll("_", " ")}
                                  </span>
                                </td>
                                <td>{lead.socialPlatform || "—"}</td>
                                <td>
                                  {lead.rating
                                    ? `${lead.rating.toFixed(1)} · ${lead.totalReviews}`
                                    : `— · ${lead.totalReviews}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
