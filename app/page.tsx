'use client';

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { LiveRunPanel } from "@/components/LiveRunPanel";
import { RunComposer } from "@/components/RunComposer";
import { RunHistory } from "@/components/RunHistory";
import { SCRAPER_CONFIG, type CampaignMode } from "@/lib/config/scraper";
import type { RunListResponse, RunSummary } from "@/lib/runs/types";

const DISMISSED_PANEL_KEY = "lead-scraper.dismissed-run-panel";

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data as T;
}

export default function Page() {
  const { data: session, status } = useSession();
  const [locationLabel, setLocationLabel] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("without_website");
  const [dashboardData, setDashboardData] = useState<RunListResponse>({
    activeRun: null,
    history: [],
  });
  const [panelRun, setPanelRun] = useState<RunSummary | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [exportStateByRunId, setExportStateByRunId] = useState<
    Record<string, { loading: boolean; error: string } | undefined>
  >({});
  const dismissedPanelRunId = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      dismissedPanelRunId.current = window.localStorage.getItem(DISMISSED_PANEL_KEY);
    }
  }, []);

  async function loadDashboard() {
    const data = await fetchJson<RunListResponse>("/api/runs");
    setDashboardData(data);

    if (data.activeRun) {
      setPanelRun(data.activeRun);
      dismissedPanelRunId.current = null;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DISMISSED_PANEL_KEY);
      }
      return;
    }

    setPanelRun((current) => {
      if (!current) {
        return null;
      }

      const replacement = data.history.find((run) => run.id === current.id) ?? current;
      if (dismissedPanelRunId.current === replacement.id) {
        return null;
      }

      return replacement;
    });
  }

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    void loadDashboard().catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard");
    });
    const interval = window.setInterval(() => {
      void loadDashboard().catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard");
      });
    }, SCRAPER_CONFIG.pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [status]);

  async function handleLocate() {
    if (!locationLabel) {
      return;
    }

    try {
      const data = await fetchJson<{
        status?: string;
        error_message?: string;
        results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
      }>("/api/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: "place/textsearch/json",
          params: { query: locationLabel },
        }),
      });

      if (data.status && data.status !== "OK") {
        if (data.status === "ZERO_RESULTS") {
          throw new Error("Location not found");
        }

        throw new Error(
          data.error_message || `Google place lookup failed with status: ${data.status}`
        );
      }

      const coordinates = data.results?.[0]?.geometry?.location;
      if (!coordinates) {
        throw new Error("Location not found");
      }

      setLat(coordinates.lat);
      setLng(coordinates.lng);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Location lookup failed");
    }
  }

  async function handleStartRun() {
    if (!selectedNiche || lat === null || lng === null) {
      return;
    }

    setIsStarting(true);
    setErrorMessage("");

    try {
      const isMapClickBasedLocation = locationLabel.trim().length === 0;
      await fetchJson<{ runId: string }>("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: selectedNiche,
          campaignMode,
          locationLabel: locationLabel.trim() || "Map Area",
          isMapClickBasedLocation,
          lat,
          lng,
          radiusKm,
        }),
      });
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start run");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStopRun() {
    if (!panelRun) {
      return;
    }

    setIsStopping(true);
    try {
      await fetchJson<{ ok: boolean }>(`/api/runs/${panelRun.id}/stop`, {
        method: "POST",
      });
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to stop run");
    } finally {
      setIsStopping(false);
    }
  }

  function handleDismissPanel() {
    if (!panelRun) {
      return;
    }

    dismissedPanelRunId.current = panelRun.id;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_PANEL_KEY, panelRun.id);
    }
    setPanelRun(null);
  }

  async function handleRefreshRun(runId: string) {
    try {
      return await fetchJson<RunSummary>(`/api/runs/${runId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load run detail");
      return null;
    }
  }

  async function handleExportRun(runId: string, format: "csv" | "xlsx") {
    setExportStateByRunId((current) => ({
      ...current,
      [runId]: { loading: true, error: "" },
    }));

    try {
      const response = await fetch(`/api/runs/${runId}/export?format=${format}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to export run");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || `run-export.${format}`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExportStateByRunId((current) => ({
        ...current,
        [runId]: { loading: false, error: "" },
      }));
    } catch (error) {
      setExportStateByRunId((current) => ({
        ...current,
        [runId]: {
          loading: false,
          error: error instanceof Error ? error.message : "Failed to export run",
        },
      }));
    }
  }

  const filteredHistory = useMemo(() => {
    return dashboardData.history.filter((run) => {
      if (selectedNiche && run.niche !== selectedNiche) {
        return false;
      }
      return run.campaignMode === campaignMode;
    });
  }, [campaignMode, dashboardData.history, selectedNiche]);

  const historyPoints = useMemo(() => {
    return filteredHistory
      .filter((run) => !(run.status === "failed" && run.matchingLeadCount === 0))
      .map((run) => ({
        lat: run.lat,
        lng: run.lng,
        radius_km: run.radiusKm,
        title: `${run.nicheName} · ${run.locationLabel}`,
      }));
  }, [filteredHistory]);

  return (
    <>
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      {status === "unauthenticated" ? (
        <AuthGate />
      ) : (
        <div className="container">
          <header className="header">
            <div className="header-left">
              <div className="logo">
                <span className="logo-icon">⚡</span>
                <h1>
                  LeadScraper <span className="pro">Pro</span>
                </h1>
              </div>
              <p className="tagline">
                Server-run local lead scraper for ranked cold outreach lists.
              </p>
            </div>
            <div className="header-right">
              <Link
                href="/messages"
                className={`btn-secondary btn-linklike header-files-link ${
                  dashboardData.activeRun ? "disabled-link" : ""
                }`}
                onClick={(event) => {
                  if (dashboardData.activeRun) {
                    event.preventDefault();
                    setErrorMessage("Stop or finish the live scrape before opening Send Messages.");
                  }
                }}
                aria-disabled={dashboardData.activeRun ? "true" : "false"}
              >
                Send Messages
              </Link>
              <Link href="/files" className="btn-secondary btn-linklike header-files-link">
                Scrape Files
              </Link>
              <div className="user-profile">
                <div className="user-info">
                  <span className="user-name">
                    {session?.user?.name || session?.user?.username || "Admin"}
                  </span>
                  <span className="user-status">System Active</span>
                </div>
                <button className="btn-logout" onClick={() => void signOut()}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </header>

          {errorMessage ? (
            <section className="card error-card">
              <div className="card-header">
                <h2>Error</h2>
              </div>
              <p style={{ color: "var(--error)" }}>{errorMessage}</p>
            </section>
          ) : null}

          {panelRun ? (
            <LiveRunPanel
              run={panelRun}
              isStopping={isStopping}
              exportState={exportStateByRunId[panelRun.id] ?? null}
              onStop={() => void handleStopRun()}
              onDismiss={handleDismissPanel}
              onExport={(format) => void handleExportRun(panelRun.id, format)}
            />
          ) : null}

          <RunComposer
            locationLabel={locationLabel}
            setLocationLabel={setLocationLabel}
            lat={lat}
            lng={lng}
            radiusKm={radiusKm}
            setRadiusKm={setRadiusKm}
            selectedNiche={selectedNiche}
            setSelectedNiche={setSelectedNiche}
            campaignMode={campaignMode}
            setCampaignMode={setCampaignMode}
            onLocate={handleLocate}
            onPositionChange={(nextLat, nextLng) => {
              setLat(nextLat);
              setLng(nextLng);
            }}
            onStart={handleStartRun}
            isStarting={isStarting}
            historyPoints={historyPoints}
            disableActions={Boolean(dashboardData.activeRun) || isStarting}
          />

          <RunHistory
            runs={filteredHistory}
            onRefreshRun={handleRefreshRun}
            exportStateByRunId={exportStateByRunId}
            onExportRun={(runId, format) => void handleExportRun(runId, format)}
          />
        </div>
      )}
    </>
  );
}
