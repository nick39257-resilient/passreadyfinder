import { useEffect, useState } from "react";
import type { ApiLead } from "../api/leads";
import {
  getLeadReasonBullets,
  priorityFromBand,
  priorityLabel,
  statusDisplayLabel,
} from "../lib/lead-insights";
import { riskPillStyles } from "../lib/risk-styles";
import type { RiskBand } from "./ActionCard";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { ContactRoutesPanel } from "./ContactRoutesPanel";

function ScoreCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-2.5 text-center ${
        highlight
          ? "border-amber-500/50 bg-amber-950/30"
          : "border-slate-800 bg-slate-950/80"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-100">
        {value === null ? "—" : value}
      </p>
      <p className="text-[10px] text-slate-500">/ 25</p>
    </div>
  );
}

export function LeadDetailDrawer({
  lead,
  onClose,
  onQuickDraft,
  onQueuePostbox,
  onSetEmail,
  onSetFlagForReview,
  onMarkNotInterested,
  onMarkVisited,
  onOpenFind,
  onDiscoverContacts,
  onSaveContactManual,
  onLoadFullDetail,
  onStopSequence,
  onMarkTrial,
  onMarkOptedIn,
  onSnooze,
  onDismiss,
  busy,
  busyLabel = "Working…",
  draftDisabled,
  draftDisabledReason,
  outreachHalted,
  errorMessage,
  outreachLandingUrl = "https://score.passready.uk",
}: {
  lead: ApiLead;
  onClose: () => void;
  onQuickDraft: () => void;
  onQueuePostbox: () => void;
  onSetEmail: (email: string) => void;
  onSetFlagForReview: (flagged: boolean) => void;
  onMarkNotInterested: () => void;
  onMarkVisited: () => void;
  onOpenFind: () => void;
  onDiscoverContacts: () => void;
  onSaveContactManual: (patch: Record<string, string | boolean>) => void;
  onLoadFullDetail?: () => void;
  onStopSequence: () => void;
  onMarkTrial: () => void;
  onMarkOptedIn: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  busy?: boolean;
  busyLabel?: string;
  draftDisabled?: boolean;
  draftDisabledReason?: string;
  outreachHalted?: boolean;
  errorMessage?: string | null;
  outreachLandingUrl?: string;
}) {
  const band = lead.riskBand as RiskBand;
  const tier = priorityFromBand(band);
  const focus = lead.carrotFocusArea;
  const scores = lead.fsaScores;
  const reasons = getLeadReasonBullets(lead, 3);
  const isDrafted = lead.status === "drafted" || lead.status === "approved";
  const isInPostbox = lead.status === "approved";
  const [emailDraft, setEmailDraft] = useState("");
  const flaggedForReview = Boolean(lead.flagForReview);
  const needsEyesReason = lead.needsEyesReason?.trim() || null;

  useEffect(() => {
    setEmailDraft(lead.email ?? "");
  }, [lead.id, lead.email]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-slate-600" aria-hidden />

        <div className="p-5 pb-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold leading-tight">{lead.businessName}</h2>
              <p className="mt-1 text-xs text-slate-500">{lead.postcode}</p>
              {lead.phone?.trim() ? (
                <p className="mt-1 text-xs text-slate-400">Phone: {lead.phone.trim()}</p>
              ) : null}
              {lead.whatsappUrl ? (
                <a
                  href={lead.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white ring-1 ring-emerald-400/40"
                >
                  Open WhatsApp
                </a>
              ) : null}
              {lead.email ? (
                <p className="mt-1 text-xs text-emerald-400/90">Email: {lead.email}</p>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-amber-400/90">
                    No business email yet — run Find leads to discover one
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onOpenFind}
                    className="rounded-full bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-500/30 disabled:opacity-50"
                    title="Find leads (refresh area)"
                  >
                    Find leads
                  </button>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSetFlagForReview(!flaggedForReview)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                    flaggedForReview
                      ? "bg-amber-500/20 text-amber-200 ring-amber-500/40"
                      : "bg-slate-800/90 text-slate-300 ring-slate-700/60"
                  }`}
                  title="Force this lead into Needs Eyes (never auto-postbox)"
                >
                  {flaggedForReview ? "Flagged for review" : "Flag for review"}
                </button>
                {needsEyesReason ? (
                  <span className="rounded-full bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 ring-1 ring-violet-500/30">
                    Needs Eyes: {needsEyesReason}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="Paste business email"
                  className="min-h-[40px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
                  inputMode="email"
                  autoComplete="email"
                />
                <button
                  type="button"
                  disabled={busy || !emailDraft.trim().includes("@")}
                  onClick={() => onSetEmail(emailDraft.trim())}
                  className="min-h-[40px] shrink-0 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50"
                  title="Save business email"
                >
                  Save
                </button>
              </div>
              {lead.rivalBadge ? (
                <span className="mt-2 inline-block rounded-full border border-violet-500/40 bg-violet-950/40 px-3 py-1 text-xs font-semibold text-violet-200">
                  {lead.rivalBadge}
                </span>
              ) : null}
            </div>
            <RiskScoreBadge score={lead.riskScore} band={band} />
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
              {statusDisplayLabel(lead.status)}
            </span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
              {priorityLabel(tier)}
            </span>
          </div>

          {reasons.length > 0 ? (
            <ul className="mb-4 space-y-1">
              {reasons.map((r) => (
                <li key={r} className="text-xs text-slate-400">
                  · {r}
                </li>
              ))}
            </ul>
          ) : null}

          <ContactRoutesPanel
            discovery={lead.contactDiscovery}
            busy={busy}
            onDiscover={onDiscoverContacts}
            onSaveManual={onSaveContactManual}
          />

          {onLoadFullDetail ? (
            <button
              type="button"
              disabled={busy}
              onClick={onLoadFullDetail}
              className="mb-3 min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950/60 text-xs font-semibold text-slate-300 disabled:opacity-50"
            >
              Load full detail
            </button>
          ) : null}

          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              FSA breakdown
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <ScoreCell label="Hygiene" value={scores.hygiene} highlight={focus === "hygiene"} />
              <ScoreCell
                label="Structure"
                value={scores.structural}
                highlight={focus === "structural"}
              />
              <ScoreCell
                label="Management"
                value={scores.management}
                highlight={focus === "management"}
              />
            </div>
          </section>

          {lead.consultantTip ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/25 p-3">
              <p className="text-[10px] font-semibold uppercase text-amber-400">Consultant tip</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-50">{lead.consultantTip}</p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              FSA sub-scores not loaded — run Find leads first.
            </p>
          )}

          {errorMessage ? (
            <div className="mb-3 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {busy ? (
            <p className="mb-3 text-center text-sm font-medium text-emerald-400">{busyLabel}</p>
          ) : null}

          <div className="mb-3">
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                disabled={busy || outreachHalted || lead.status === "replied"}
                onClick={onStopSequence}
                className="min-h-[44px] rounded-xl border border-sky-500/40 bg-sky-950/40 text-[11px] font-bold text-sky-100 disabled:opacity-40"
                title="Replied (stop sequence)"
              >
                Replied
              </button>
              <button
                type="button"
                disabled={busy || outreachHalted}
                onClick={onMarkOptedIn}
                className="min-h-[44px] rounded-xl border border-violet-500/40 bg-violet-950/30 text-[11px] font-bold text-violet-100 disabled:opacity-40"
                title="Converted (stop sequence)"
              >
                Converted
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onMarkNotInterested}
                className="min-h-[44px] rounded-xl border border-red-500/40 bg-red-950/30 text-[11px] font-bold text-red-100 disabled:opacity-40"
                title="Not interested (suppress + stop)"
              >
                Not interested
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onMarkVisited}
                className="min-h-[44px] rounded-xl border border-slate-600 bg-slate-800 text-[11px] font-bold text-slate-200 disabled:opacity-40"
                title="Visited (note)"
              >
                Visited
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || draftDisabled}
              onClick={onQuickDraft}
              className="min-h-[52px] rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy
                ? busyLabel
                : isDrafted
                  ? "Re-draft message"
                  : "Quick-draft"}
            </button>
            <button
              type="button"
              disabled={busy || isInPostbox || lead.status !== "drafted"}
              onClick={onQueuePostbox}
              className="min-h-[52px] rounded-xl border border-amber-500/40 bg-amber-950/30 text-sm font-bold text-amber-100 disabled:opacity-50"
            >
              {isInPostbox ? "In postbox (2pm)" : "Add to postbox"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onSnooze}
              className="min-h-[52px] rounded-xl border border-slate-600 bg-slate-800 text-sm font-bold text-slate-200 disabled:opacity-50"
            >
              Snooze 30d
            </button>
            <a
              href={lead.ehoReportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center justify-center rounded-xl border border-sky-600/50 bg-sky-950/40 text-sm font-bold text-sky-200"
            >
              EHO report
            </a>
            <a
              href={outreachLandingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 flex min-h-[52px] items-center justify-center rounded-xl border border-emerald-600/50 bg-emerald-950/40 text-sm font-bold text-emerald-200"
            >
              SafeScore link →
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              className="min-h-[52px] rounded-xl border border-red-500/40 bg-red-950/30 text-sm font-bold text-red-200 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>

          {draftDisabled && draftDisabledReason ? (
            <p className="mt-2 text-center text-xs text-slate-500">{draftDisabledReason}</p>
          ) : null}

          {isDrafted ? (
            <a
              href="/review"
              className="mt-3 flex min-h-[44px] items-center justify-center rounded-xl border border-violet-500/40 bg-violet-950/30 text-sm font-semibold text-violet-200"
            >
              Review draft in queue →
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
