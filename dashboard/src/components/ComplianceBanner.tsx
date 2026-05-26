export function ComplianceBanner({ tip }: { tip: string }) {
  return (
    <aside className="mb-3 rounded-xl border border-amber-500/20 bg-amber-950/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">
        Compliance insight
      </p>
      <p className="mt-0.5 text-xs leading-snug text-amber-100/90">{tip}</p>
    </aside>
  );
}
