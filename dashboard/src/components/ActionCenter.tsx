import { useCallback, useEffect, useState } from "react";
import {
  fetchActionQueueDigest,
  markCallLoggedApi,
  markWhatsAppSentApi,
  type ActionQueueDigest,
  type ActionQueueItem,
} from "../api/action-queue";
import { getControlSecret } from "../lib/control-secret";

type Props = {
  onOpenLead: (leadId: number) => void;
};

function laneLabel(lane: ActionQueueItem["lane"]): string {
  if (lane === "warm") return "Warm";
  if (lane === "trigger") return "Trigger";
  if (lane === "whatsapp") return "WhatsApp";
  return "Call";
}

function laneTone(lane: ActionQueueItem["lane"]): string {
  if (lane === "warm") return "bg-emerald-500/15 text-emerald-300 border-emerald-600/40";
  if (lane === "trigger") return "bg-amber-500/15 text-amber-300 border-amber-600/40";
  if (lane === "whatsapp") return "bg-green-500/15 text-green-300 border-green-600/40";
  return "bg-sky-500/15 text-sky-300 border-sky-600/40";
}

function ActionRow({
  item,
  rank,
  busy,
  onOpenLead,
  onMarkWa,
  onMarkCall,
}: {
  item: ActionQueueItem;
  rank?: number;
  busy: boolean;
  onOpenLead: (id: number) => void;
  onMarkWa: (id: number) => void;
  onMarkCall: (id: number) => void;
}) {
  return (
    <li className="rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {rank != null ? (
              <span className="text-[10px] font-bold tabular-nums text-slate-500">#{rank}</span>
            ) : null}
            <button
              type="button"
              onClick={() => onOpenLead(item.leadId)}
              className="truncate text-left text-sm font-semibold text-slate-100 hover:text-white"
            >
              {item.businessName}
            </button>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${laneTone(item.lane)}`}
            >
              {laneLabel(item.lane)}
            </span>
            <span className="text-[10px] tabular-nums text-slate-500">
              prio {item.priorityScore}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {item.postcode}
            {item.fsaRating != null ? ` · ${item.fsaRating}★` : ""}
            {item.reasons.length > 0 ? ` · ${item.reasons.slice(0, 2).join(" · ")}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {item.whatsappUrl && !item.whatsappSentAt ? (
            <>
              <a
                href={item.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-9 rounded-lg border border-green-700/50 bg-green-950/40 px-2.5 text-[11px] font-semibold text-green-200"
              >
                Open WA
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => onMarkWa(item.leadId)}
                className="min-h-9 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-semibold text-slate-300 disabled:opacity-50"
              >
                WA sent
              </button>
            </>
          ) : null}
          {item.phone && !item.callLoggedAt ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMarkCall(item.leadId)}
              className="min-h-9 rounded-lg border border-sky-800/50 bg-sky-950/30 px-2.5 text-[11px] font-semibold text-sky-200 disabled:opacity-50"
            >
              Log call
            </button>
          ) : null}
        </div>
      </div>
      {item.whatsappMessage ? (
        <p className="mt-2 rounded-lg bg-slate-900/60 px-2 py-1.5 text-[11px] leading-snug text-slate-400">
          {item.whatsappMessage}
        </p>
      ) : null}
    </li>
  );
}

function MetricsBar({ digest }: { digest: ActionQueueDigest }) {
  const m = digest.metrics;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2">
        <p className="text-slate-500">Score clicks</p>
        <p className="text-lg font-bold tabular-nums text-slate-100">{m.scoreClicksTotal}</p>
        <p className="text-[10px] text-slate-600">
          UK {m.scoreClicksUk} · US {m.scoreClicksUs}
        </p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2">
        <p className="text-slate-500">WhatsApp sent</p>
        <p className="text-lg font-bold tabular-nums text-green-300">
          {m.whatsappSentToday}
          <span className="text-sm font-normal text-slate-500"> / {m.whatsappDailyCap} today</span>
        </p>
        <p className="text-[10px] text-slate-600">{m.whatsappSentTotal} all time</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2">
        <p className="text-slate-500">Calls logged</p>
        <p className="text-lg font-bold tabular-nums text-sky-300">{m.callsLoggedToday}</p>
        <p className="text-[10px] text-slate-600">{m.callsLoggedTotal} all time</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2">
        <p className="text-slate-500">Warm + replies</p>
        <p className="text-lg font-bold tabular-nums text-emerald-300">{m.warmVisitors7d}</p>
        <p className="text-[10px] text-slate-600">{m.repliesTotal} marked replies</p>
      </div>
    </div>
  );
}

export function ActionCenter({ onOpenLead }: Props) {
  const [digest, setDigest] = useState<ActionQueueDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tab, setTab] = useState<"top" | "wa" | "triggers">("top");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDigest(await fetchActionQueueDigest());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const secret = getControlSecret();

  async function handleMarkWa(leadId: number) {
    setBusyId(leadId);
    try {
      await markWhatsAppSentApi(leadId, secret);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkCall(leadId: number) {
    setBusyId(leadId);
    try {
      await markCallLoggedApi(leadId, secret);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!digest?.metrics.copilotMode && !loading && !error) {
    return null;
  }

  const list =
    tab === "wa"
      ? digest?.whatsappQueue ?? []
      : tab === "triggers"
        ? digest?.triggers ?? []
        : digest?.top ?? [];

  return (
    <section className="mb-4 rounded-2xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/30 to-slate-950/60 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/90">
            Copilot action center
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-100">
            Today&apos;s priorities — warm leads first
          </h2>
          <p className="mt-1 max-w-xl text-[11px] leading-snug text-slate-500">
            Cold email autosend is off. Work the Top 10: score visitors, FSA triggers, then WhatsApp or call.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-9 rounded-lg border border-slate-700 bg-slate-900/80 px-3 text-[11px] font-semibold text-slate-400"
        >
          Refresh queue
        </button>
      </div>

      {digest ? <MetricsBar digest={digest} /> : null}

      <div className="mt-3 flex gap-1">
        {(["top", "wa", "triggers"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`min-h-8 rounded-lg px-2.5 text-[11px] font-semibold ${
              tab === key
                ? "bg-slate-800 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {key === "top"
              ? `Top ${digest?.digestSize ?? 10}`
              : key === "wa"
                ? `WhatsApp (${digest?.whatsappQueue.length ?? 0})`
                : `Triggers (${digest?.triggers.length ?? 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading action queue…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No actionable leads right now — check back after score traffic or FSA sync.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map((item, i) => (
            <ActionRow
              key={item.leadId}
              item={item}
              rank={tab === "top" ? i + 1 : undefined}
              busy={busyId === item.leadId}
              onOpenLead={onOpenLead}
              onMarkWa={handleMarkWa}
              onMarkCall={handleMarkCall}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
