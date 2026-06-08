import { highlightScoreUrl } from "../lib/outreach-sequence";

export function DraftPreviewBlock({
  text,
  hasScoreLink,
  maxLines = 3,
}: {
  text: string;
  hasScoreLink: boolean;
  maxLines?: number;
}) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const highlighted = highlightScoreUrl(normalized);

  return (
    <div
      className={`mt-2 rounded-lg border px-2.5 py-2 ${
        hasScoreLink
          ? "border-emerald-500/40 bg-emerald-950/25"
          : "border-amber-500/30 bg-amber-950/15"
      }`}
    >
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {hasScoreLink ? "Draft preview · score link included" : "Draft preview · no score link"}
      </p>
      <p
        className={`text-xs leading-snug text-slate-300 ${
          maxLines <= 2 ? "line-clamp-2" : maxLines <= 3 ? "line-clamp-3" : "line-clamp-6"
        }`}
      >
        {highlighted ? (
          <>
            {highlighted.before}
            <span className="font-semibold text-emerald-300">{highlighted.url}</span>
            {highlighted.after}
          </>
        ) : (
          normalized
        )}
      </p>
    </div>
  );
}
