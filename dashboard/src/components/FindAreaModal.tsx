import { useEffect, useState } from "react";

export interface FindAreaForm {
  area: string;
  postcodePrefix: string;
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

  useEffect(() => {
    if (open) {
      setArea(initialArea);
      setPostcodePrefix(initialPostcodePrefix);
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
        <h2 className="text-lg font-bold text-slate-50">Find takeaways in area</h2>
        <p className="mt-2 text-sm text-slate-400">
          Pulls new FSA listings for your local authority, worst ratings first (up to 2★), then
          enriches contact details.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Local authority
          </span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Preston"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:ring-2 focus:ring-sky-500/40"
            autoComplete="off"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Must match FSA council name (e.g. Preston, Blackburn with Darwen).
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
              })
            }
            className="min-h-[48px] rounded-xl bg-sky-600 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Finding…" : "Find & refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}
