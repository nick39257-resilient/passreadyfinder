import { useEffect, useState } from "react";
import type { ApiContactDiscovery } from "../api/contact-discovery";

function RouteRow({
  label,
  found,
  value,
  sourceUrl,
}: {
  label: string;
  found: boolean;
  value?: string | null;
  sourceUrl?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <div className="min-w-0 text-right">
        <span className={found ? "font-semibold text-emerald-300" : "text-slate-500"}>
          {found ? "found" : "not found"}
        </span>
        {found && value ? (
          <p className="mt-0.5 truncate text-[10px] text-slate-500" title={value}>
            {value}
          </p>
        ) : null}
        {found && sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block text-[10px] text-sky-400 underline"
          >
            source
          </a>
        ) : null}
      </div>
    </div>
  );
}

function DraftBlock({ label, text }: { label: string; text: string | null | undefined }) {
  if (!text?.trim()) {
    return null;
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{text}</p>
    </div>
  );
}

export function ContactRoutesPanel({
  discovery,
  busy,
  onDiscover,
  onSaveManual,
}: {
  discovery: ApiContactDiscovery | null;
  busy?: boolean;
  onDiscover: () => void;
  onSaveManual: (patch: Record<string, string | boolean>) => void;
}) {
  const [editEmail, setEditEmail] = useState(discovery?.email ?? "");
  const [editPhone, setEditPhone] = useState(discovery?.phone ?? "");

  useEffect(() => {
    setEditEmail(discovery?.email ?? "");
    setEditPhone(discovery?.phone ?? "");
  }, [discovery?.leadId, discovery?.email, discovery?.phone]);

  const d = discovery;
  const hasDiscovery = Boolean(d?.discoveredAt);

  return (
    <section className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Contact routes found</h3>
          {d ? (
            <p className="text-xs text-slate-500">
              Contact score: <span className="font-semibold text-emerald-400">{d.contactScore}/100</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500">Run discovery to find outreach channels</p>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDiscover}
          className="shrink-0 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Scanning…" : "Find contact routes"}
        </button>
      </div>

      {hasDiscovery && d ? (
        <>
          <div className="mb-3 space-y-2 rounded-xl border border-slate-800 p-3">
            <RouteRow label="Email" found={Boolean(d.email)} value={d.email} sourceUrl={d.emailSourceUrl} />
            <RouteRow
              label="Website"
              found={Boolean(d.website)}
              value={d.website}
              sourceUrl={d.websiteSourceUrl}
            />
            <RouteRow
              label="Contact form"
              found={d.contactFormDetected}
              value={d.contactFormDetected ? "Yes" : undefined}
              sourceUrl={d.contactFormSourceUrl}
            />
            <RouteRow
              label="Facebook"
              found={Boolean(d.facebookUrl)}
              value={d.facebookUrl}
              sourceUrl={d.facebookSourceUrl}
            />
            <RouteRow label="Phone" found={Boolean(d.phone)} value={d.phone} sourceUrl={d.phoneSourceUrl} />
            <RouteRow
              label="WhatsApp"
              found={Boolean(d.whatsapp)}
              value={d.whatsapp}
              sourceUrl={d.whatsappSourceUrl}
            />
          </div>

          {d.aiSummary || d.aiRecommendedPitch ? (
            <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 text-xs text-violet-100">
              {d.aiSummary ? <p className="font-semibold">{d.aiSummary}</p> : null}
              {d.aiRecommendedPitch ? (
                <p className="mt-1 text-violet-200/90">{d.aiRecommendedPitch}</p>
              ) : null}
            </div>
          ) : null}

          <div className="mb-3 space-y-2">
            <DraftBlock label="Email draft" text={d.drafts.email} />
            <DraftBlock label="Contact form message" text={d.drafts.contactForm} />
            <DraftBlock label="Facebook message" text={d.drafts.facebook} />
            <DraftBlock label="WhatsApp message" text={d.drafts.whatsapp} />
            <DraftBlock label="Phone script" text={d.drafts.phoneScript} />
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-slate-400">Manual override</summary>
            <div className="mt-2 space-y-2">
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Email override"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Phone override"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onSaveManual({
                    email: editEmail.trim() || "",
                    phone: editPhone.trim() || "",
                  })
                }
                className="w-full rounded-lg bg-slate-700 py-2 font-bold text-slate-100 disabled:opacity-50"
              >
                Save overrides
              </button>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
