import { useEffect, useState } from "react";

export interface FindAreaForm {
  area: string;
  postcodePrefix: string;
  fullResync: boolean;
}

export function FindAreaModal({
  open,
  initialArea,
  initialPostcodePrefix,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  initialArea: string;
  initialPostcodePrefix: string;
  onConfirm: (form: FindAreaForm) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [area, setArea] = useState(initialArea);
  const [postcodePrefix, setPostcodePrefix] = useState(initialPostcodePrefix);
  const [fullResync, setFullResync] = useState(false);

  useEffect(() => {
    if (open) {
      setArea(initialArea);
      setPostcodePrefix(initialPostcodePrefix);
      setFullResync(false);
    }
  }, [open, initialArea, initialPostcodePrefix]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-50">Check FSA changes</h2>
        <p className="mt-2 text-sm text-slate-400">
          Free FSA sync — after your first run, only takeaways with a new inspection date
          are imported. OSM enriches changed leads only (no Google).
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Area (authority / town / county)
          </span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Preston or Lancashire"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:ring-2 focus:ring-sky-500/40"
            autoComplete="off"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Tip: “Lancashire” will search multiple councils (Preston, Lancaster City, etc.).
          </span>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Postcode area (optional)
          </span>
          <input
            type="text"
            value={postcodePrefix}
            onChange={(e) => setPostcodePrefix(e.target.value.toUpperCase())}
            placeholder="PR1"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:ring-2 focus:ring-sky-500/40"
            autoComplete="postal-code"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Only keep takeaways whose postcode starts with this (e.g. PR1, BB2).
          </span>
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
          <input
            type="checkbox"
            checked={fullResync}
            onChange={(e) => setFullResync(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600"
          />
          <span className="text-xs leading-snug text-slate-400">
            <span className="font-semibold text-slate-300">Full rescan</span> — re-import all
            matching takeaways (slower). Leave off for changes-only.
          </span>
        </label>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[48px] rounded-xl border border-slate-600 bg-slate-800 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || area.trim().length < 2}
            onClick={() =>
              onConfirm({
                area: area.trim(),
                postcodePrefix: postcodePrefix.trim(),
                fullResync,
              })
            }
            className="min-h-[48px] rounded-xl bg-sky-600 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Checking…" : fullResync ? "Full rescan" : "Check changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
