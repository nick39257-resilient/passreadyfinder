import { useCallback, useEffect, useState } from "react";
import {
  fetchDeliverabilityReport,
  sendDeliverabilityTest,
  type DeliverabilityReport,
} from "../api/deliverability";

function pctLabel(value: number | null, suffix = "%"): string {
  if (value == null) {
    return "—";
  }
  return `${value}${suffix}`;
}

function StatBlock({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: "slate" | "emerald" | "amber" | "rose" | "sky";
}) {
  const tones = {
    slate: "text-slate-200",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{hint}</p>
    </div>
  );
}

export function DeliverabilityPanel({ compact = false }: { compact?: boolean }) {
  const [report, setReport] = useState<DeliverabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testRegion, setTestRegion] = useState<"uk" | "us">("uk");
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDeliverabilityReport();
      setReport(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliverability");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleTestSend() {
    setTestBusy(true);
    setTestMessage(null);
    try {
      const result = await sendDeliverabilityTest({ to: testTo, region: testRegion });
      setTestMessage(`Sent to ${result.to} from ${result.from} (id: ${result.messageId})`);
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setTestBusy(false);
    }
  }

  const bouncePct = report ? `${(report.bounceRate * 100).toFixed(1)}%` : "—";

  return (
    <section
      className={`rounded-2xl border border-sky-600/30 bg-gradient-to-br from-sky-950/30 to-slate-900/80 ${
        compact ? "p-3" : "mb-4 p-4"
      } shadow-[0_0_24px_rgba(56,189,248,0.06)]`}
      aria-label="Deliverability diagnostics"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-300">
            Deliverability — are emails getting through?
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            Resend “sent” means the API accepted the message — not guaranteed inbox. Zero score
            clicks usually means spam folder or wrong inboxes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="min-h-[32px] rounded-lg border border-slate-700/80 bg-slate-900/60 px-2.5 text-[11px] font-semibold text-slate-400"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}

      {report?.sendLocked ? (
        <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
          Sending locked: {report.reason}
        </p>
      ) : null}

      {report && !report.sender.resendConfigured ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          RESEND_API_KEY is not configured — outbound and test sends will fail until set in Render.
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <StatBlock label="UK logged sends" value={report?.emailEvents.sent ?? "—"} hint="Resend accepted" tone="sky" />
        <StatBlock label="Bounces" value={report?.emailEvents.bounce ?? "—"} hint={`Rate ${bouncePct}`} tone="rose" />
        <StatBlock label="Failed delivery" value={report?.uk.failedDelivery ?? "—"} hint="API error at send" tone="rose" />
        <StatBlock label="Score clicks (UK)" value={report?.uk.scoreClicks ?? "—"} hint="All-time pixel hits" tone="emerald" />
        <StatBlock
          label="Click rate"
          value={pctLabel(report?.uk.clickRatePct ?? null)}
          hint="Clicks ÷ logged sends"
          tone="emerald"
        />
        <StatBlock
          label="Replies marked"
          value={report?.uk.replied ?? "—"}
          hint={pctLabel(report?.uk.replyRatePct ?? null, "% reply rate")}
          tone="amber"
        />
      </div>

      {!compact ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatBlock label="Texas emails sent" value={report?.texas.emailSent ?? "—"} hint="EMAIL_SENT status" />
          <StatBlock label="Texas forms" value={report?.texas.formSubmitted ?? "—"} hint="Playwright submits" />
          <StatBlock label="Score clicks (US)" value={report?.texas.scoreClicks ?? "—"} hint="All-time pixel hits" tone="emerald" />
        </div>
      ) : null}

      {report ? (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5 text-[11px] text-slate-400">
          <p className="font-semibold text-slate-300">Sender addresses (live config)</p>
          <p className="mt-1">
            UK: <span className="text-slate-200">{report.sender.uk.formattedFrom}</span>
          </p>
          <p>
            US: <span className="text-slate-200">{report.sender.us.formattedFrom}</span>
          </p>
          <p className="mt-1 text-slate-500">
            Provider: Resend · Verify nick@passready.uk and nick@passready.us in Resend dashboard.
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Test send + mail-tester
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-snug text-slate-400">
          {(report?.mailTester.steps ?? [
            "Open mail-tester.com and copy their test address.",
            "Send a test below, then check your score (aim 8/10+).",
            "Also test your personal Gmail and Outlook inbox vs spam.",
          ]).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {report?.mailTester.url ? (
          <a
            href={report.mailTester.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] font-semibold text-sky-400 underline-offset-2 hover:underline"
          >
            Open mail-tester.com →
          </a>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-[11px] text-slate-400">
            Test recipient
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@gmail.com or mail-tester address"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-[11px] text-slate-400">
            Region
            <select
              value={testRegion}
              onChange={(e) => setTestRegion(e.target.value as "uk" | "us")}
              className="mt-1 block min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="uk">UK (@passready.uk)</option>
              <option value="us">US (@passready.us)</option>
            </select>
          </label>
          <button
            type="button"
            disabled={testBusy || !testTo.trim()}
            onClick={() => void handleTestSend()}
            className="min-h-[40px] rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {testBusy ? "Sending…" : "Send test"}
          </button>
        </div>
        {testMessage ? (
          <p className="mt-2 text-[11px] leading-snug text-slate-300">{testMessage}</p>
        ) : null}
      </div>
    </section>
  );
}
