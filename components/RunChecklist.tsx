'use client';

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CampaignMode } from "@/lib/config/scraper";
import type { RunChecklistLead } from "@/lib/runs/types";

type RunChecklistProps = {
  run: {
    id: string;
    nicheName: string;
    campaignMode: CampaignMode;
    locationLabel: string;
    radiusKm: number;
    stopReason: string | null;
    matchingLeadCount: number;
    startedAt: string;
  };
  leads: RunChecklistLead[];
};

function storageKey(runId: string) {
  return `lead-scraper.checklist.${runId}`;
}

function messageStorageKey(runId: string) {
  return `lead-scraper.messages.${runId}`;
}

type LeadMessageStatus = {
  state: "idle" | "sending" | "sent" | "error";
  error: string;
};

export function RunChecklist({ run, leads }: RunChecklistProps) {
  const [checkedIds, setCheckedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const raw = window.localStorage.getItem(storageKey(run.id));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      window.localStorage.removeItem(storageKey(run.id));
      return [];
    }
  });
  const [messageStatusById, setMessageStatusById] = useState<Record<string, LeadMessageStatus>>(
    () => {
      if (typeof window === "undefined") {
        return {};
      }

      const raw = window.localStorage.getItem(messageStorageKey(run.id));
      if (!raw) {
        return {};
      }

      try {
        return (JSON.parse(raw) as Record<string, LeadMessageStatus>) ?? {};
      } catch {
        window.localStorage.removeItem(messageStorageKey(run.id));
        return {};
      }
    }
  );
  const [isBulkSending, setIsBulkSending] = useState(false);

  function toggleLead(leadId: string) {
    setCheckedIds((current) => {
      const next = current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId];
      window.localStorage.setItem(storageKey(run.id), JSON.stringify(next));
      return next;
    });
  }

  function persistMessageStatuses(next: Record<string, LeadMessageStatus>) {
    window.localStorage.setItem(messageStorageKey(run.id), JSON.stringify(next));
    setMessageStatusById(next);
  }

  function markLeadTried(leadId: string) {
    setCheckedIds((current) => {
      if (current.includes(leadId)) {
        return current;
      }

      const next = [...current, leadId];
      window.localStorage.setItem(storageKey(run.id), JSON.stringify(next));
      return next;
    });
  }

  async function sendLead(lead: RunChecklistLead) {
    const sendingState = {
      ...messageStatusById,
      [lead.id]: { state: "sending" as const, error: "" },
    } satisfies Record<string, LeadMessageStatus>;
    persistMessageStatuses(sendingState);

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

      persistMessageStatuses({
        ...sendingState,
        [lead.id]: { state: "sent" as const, error: "" },
      } satisfies Record<string, LeadMessageStatus>);
      markLeadTried(lead.id);
    } catch (error) {
      persistMessageStatuses({
        ...sendingState,
        [lead.id]: {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Failed to send message.",
        },
      } satisfies Record<string, LeadMessageStatus>);
    }
  }

  async function sendAllPending() {
    setIsBulkSending(true);
    try {
      for (const lead of leads) {
        const status = messageStatusById[lead.id];
        if (status?.state === "sent" || !lead.phoneDisplay) {
          continue;
        }
        await sendLead(lead);
      }
    } finally {
      setIsBulkSending(false);
    }
  }

  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);
  const completedCount = checkedIds.length;

  return (
    <div className="checklist-shell">
      <div className="checklist-header">
        <div>
          <Link href="/" className="checklist-back">
            ← Back to dashboard
          </Link>
          <h1>{run.nicheName} checklist</h1>
          <p>
            {run.campaignMode.replaceAll("_", " ")} · {run.locationLabel} · {run.radiusKm} km
          </p>
          <p>
            {new Date(run.startedAt).toLocaleString()} · {run.stopReason?.replaceAll("_", " ") || "completed"}
          </p>
        </div>
        <div className="checklist-summary">
          <span>{completedCount} tried</span>
          <span>{Math.max(run.matchingLeadCount - completedCount, 0)} pending</span>
        </div>
      </div>
      <div className="run-actions" style={{ marginTop: 0, marginBottom: "18px" }}>
        <button
          type="button"
          className="btn-locate"
          onClick={() => void sendAllPending()}
          disabled={isBulkSending}
        >
          {isBulkSending ? "Sending..." : "Send All Pending"}
        </button>
      </div>

      <div className="checklist-list">
        {leads.map((lead, index) => {
          const checked = checkedSet.has(lead.id);
          const status = messageStatusById[lead.id] ?? { state: "idle", error: "" };

          return (
            <label
              key={lead.id}
              className={`checklist-row ${checked ? "checked" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleLead(lead.id)}
              />
              <div className="checklist-rank">{lead.rank ?? index + 1}</div>
              <div className="checklist-main">
                <div className="checklist-title-row">
                  {lead.googleMapsUrl ? (
                    <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer">
                      {lead.businessName}
                    </a>
                  ) : (
                    <span>{lead.businessName}</span>
                  )}
                  <span className="status-badge">{lead.classification.replaceAll("_", " ")}</span>
                  {lead.isLikelyChain ? <span className="chain-badge">chain</span> : null}
                </div>
                <div className="checklist-meta">
                  <span>{lead.phoneDisplay || "No phone"}</span>
                  <span>
                    {lead.rating ? `${lead.rating.toFixed(1)} · ${lead.totalReviews} reviews` : `${lead.totalReviews} reviews`}
                  </span>
                  <span>{lead.socialPlatform || "No social"}</span>
                </div>
                {lead.addressDisplay ? <div className="checklist-address">{lead.addressDisplay}</div> : null}
                <div className="checklist-links">
                  {lead.websiteUrl ? (
                    <a href={lead.websiteUrl} target="_blank" rel="noreferrer">
                      Website
                    </a>
                  ) : null}
                  {lead.socialLink ? (
                    <a href={lead.socialLink} target="_blank" rel="noreferrer">
                      Social
                    </a>
                  ) : null}
                </div>
                {status.error ? <div className="file-error">{status.error}</div> : null}
              </div>
              <div className="checklist-actions">
                <button
                  type="button"
                  className="btn-locate"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void sendLead(lead);
                  }}
                  disabled={!lead.phoneDisplay || status.state === "sending" || status.state === "sent"}
                >
                  {status.state === "sent"
                    ? "Sent"
                    : status.state === "sending"
                      ? "Sending..."
                      : "Send message"}
                </button>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
