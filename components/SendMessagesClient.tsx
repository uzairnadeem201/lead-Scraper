'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { RunChecklistLead, RunFileItem } from "@/lib/runs/types";

type ChecklistResponse = {
  run: {
    id: string;
    nicheName: string;
    campaignMode: string;
    locationLabel: string;
    radiusKm: number;
    stopReason: string | null;
    matchingLeadCount: number;
    startedAt: string;
  };
  leads: RunChecklistLead[];
};

type SendMessagesClientProps = {
  runs: RunFileItem[];
};

type LeadStatus = {
  state: "idle" | "sending" | "sent" | "error";
  error: string;
};

function storageKey(runId: string) {
  return `lead-scraper.messages.${runId}`;
}

export function SendMessagesClient({ runs }: SendMessagesClientProps) {
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedData, setSelectedData] = useState<ChecklistResponse | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [leadStatusById, setLeadStatusById] = useState<Record<string, LeadStatus>>({});
  const [bulkSending, setBulkSending] = useState(false);

  const sortedRuns = useMemo(
    () =>
      [...runs].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      ),
    [runs]
  );

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedData(null);
      setLeadStatusById({});
      return;
    }

    let cancelled = false;
    setLoadingLeads(true);
    setLoadError("");

    void fetch(`/api/runs/${selectedRunId}/leads`)
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "Failed to load leads.");
        }
        return (await response.json()) as ChecklistResponse;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }

        setSelectedData(data);
        const raw = window.localStorage.getItem(storageKey(selectedRunId));
        if (!raw) {
          setLeadStatusById({});
          return;
        }

        try {
          const parsed = JSON.parse(raw) as Record<string, LeadStatus>;
          setLeadStatusById(parsed ?? {});
        } catch {
          window.localStorage.removeItem(storageKey(selectedRunId));
          setLeadStatusById({});
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load leads.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLeads(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  function persistStatuses(runId: string, next: Record<string, LeadStatus>) {
    window.localStorage.setItem(storageKey(runId), JSON.stringify(next));
    setLeadStatusById(next);
  }

  async function sendLead(lead: RunChecklistLead) {
    if (!selectedRunId) {
      return;
    }

    const sendingState = {
      ...leadStatusById,
      [lead.id]: { state: "sending" as const, error: "" },
    } satisfies Record<string, LeadStatus>;
    persistStatuses(selectedRunId, sendingState);

    try {
      const response = await fetch("/api/messages/ringcentral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: lead.phoneDisplay,
          businessName: lead.businessName,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to send message.");
      }

      persistStatuses(selectedRunId, {
        ...sendingState,
        [lead.id]: { state: "sent" as const, error: "" },
      } satisfies Record<string, LeadStatus>);
    } catch (error) {
      persistStatuses(selectedRunId, {
        ...sendingState,
        [lead.id]: {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Failed to send message.",
        },
      } satisfies Record<string, LeadStatus>);
    }
  }

  async function sendAllPending() {
    if (!selectedData) {
      return;
    }

    setBulkSending(true);
    try {
      for (const lead of selectedData.leads) {
        const status = leadStatusById[lead.id];
        if (status?.state === "sent" || !lead.phoneDisplay) {
          continue;
        }
        await sendLead(lead);
      }
    } finally {
      setBulkSending(false);
    }
  }

  return (
    <div className="files-shell">
      <div className="files-header">
        <div>
          <Link href="/" className="checklist-back">
            ← Back to dashboard
          </Link>
          <h1>Send Messages</h1>
          <p>Select a saved scrape file and send RingCentral SMS messages one by one.</p>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Select Scrape File</h2>
        </div>
        <div className="files-filters">
          <label className="files-filter" style={{ gridColumn: "1 / -1" }}>
            <span>Scrape file</span>
            <select
              value={selectedRunId}
              onChange={(event) => setSelectedRunId(event.target.value)}
            >
              <option value="">Choose a scrape file</option>
              {sortedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.nicheName} · {run.locationLabel} ·{" "}
                  {new Date(run.startedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loadError ? (
        <section className="card error-card">
          <div className="card-header">
            <h2>Error</h2>
          </div>
          <p style={{ color: "var(--error)" }}>{loadError}</p>
        </section>
      ) : null}

      {loadingLeads ? (
        <section className="card">
          <p>Loading leads...</p>
        </section>
      ) : null}

      {selectedData ? (
        <section className="card">
          <div className="card-header">
            <h2>
              {selectedData.run.nicheName} · {selectedData.run.locationLabel}
            </h2>
          </div>
          <div className="run-summary-stack">
            <div>
              {selectedData.run.campaignMode.replaceAll("_", " ")} ·{" "}
              {selectedData.run.radiusKm} km ·{" "}
              {new Date(selectedData.run.startedAt).toLocaleString()}
            </div>
            <div>{selectedData.leads.length} leads loaded for messaging</div>
          </div>
          <div className="run-actions">
            <button
              type="button"
              className="btn-locate"
              onClick={() => void sendAllPending()}
              disabled={bulkSending}
            >
              {bulkSending ? "Sending..." : "Send All Pending"}
            </button>
            <Link
              href={`/runs/${selectedData.run.id}`}
              className="btn-secondary btn-linklike"
            >
              Open checklist
            </Link>
          </div>
          <div className="files-list" style={{ marginTop: "18px" }}>
            {selectedData.leads.map((lead) => {
              const status = leadStatusById[lead.id] ?? { state: "idle", error: "" };

              return (
                <div
                  key={lead.id}
                  className={`file-row ${status.state === "sent" ? "message-sent-row" : ""}`}
                >
                  <div className="file-main">
                    <div className="file-title-row">
                      <h3>{lead.businessName}</h3>
                      <span className="status-badge">
                        {lead.classification.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="file-meta">
                      <span>{lead.phoneDisplay || "No phone"}</span>
                      <span>{lead.addressDisplay || "No address"}</span>
                    </div>
                    <div className="file-meta">
                      <span>
                        Preview: Hi! How is it going? Is it {lead.businessName}
                      </span>
                    </div>
                    {status.error ? <div className="file-error">{status.error}</div> : null}
                  </div>
                  <div className="file-actions">
                    <button
                      type="button"
                      className="btn-locate"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void sendLead(lead);
                      }}
                      disabled={
                        !lead.phoneDisplay ||
                        status.state === "sending" ||
                        status.state === "sent"
                      }
                    >
                      {status.state === "sent"
                        ? "Sent"
                        : status.state === "sending"
                          ? "Sending..."
                          : "Send message"}
                    </button>
                    {lead.googleMapsUrl ? (
                      <a
                        href={lead.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary btn-linklike"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open lead
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
