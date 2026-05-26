export function ComplianceBanner({ tip }: { tip: string }) {
  return (
    <aside className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
        Compliance insight
      </p>
      <p className="mt-1 text-sm leading-snug text-amber-100">{tip}</p>
    </aside>
  );
}
