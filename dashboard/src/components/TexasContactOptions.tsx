import { useState, type MouseEvent } from "react";
import type { ApiTexasLead } from "../api/texas-leads";
import {
  buildTexasMapsSearchUrl,
  buildTexasPitchScript,
  buildTexasSocialSearchUrl,
  isTexasMultiChannelReady,
} from "../lib/texas-multi-channel";

export function TexasContactOptions({ lead }: { lead: ApiTexasLead }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const ready = isTexasMultiChannelReady(lead);
  const mapsUrl = buildTexasMapsSearchUrl(lead);
  const socialUrl = buildTexasSocialSearchUrl(lead);

  const copyScript = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const text = buildTexasPitchScript(lead);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  if (!ready) {
    return (
      <p className="text-xs text-slate-500">
        Location data needed for multi-channel outreach links.
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-3 gap-2"
      role="group"
      aria-label="Contact options"
      onClick={(e) => e.stopPropagation()}
    >
      {mapsUrl ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center justify-center rounded-xl bg-slate-600 px-2 text-center text-xs font-bold text-slate-100"
        >
          Call/Find
        </a>
      ) : (
        <span className="flex min-h-12 items-center justify-center rounded-xl bg-slate-800 px-2 text-center text-xs text-slate-500">
          Call/Find
        </span>
      )}
      {socialUrl ? (
        <a
          href={socialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-2 text-center text-xs font-bold text-white"
        >
          Search Social
        </a>
      ) : (
        <span className="flex min-h-12 items-center justify-center rounded-xl bg-slate-800 px-2 text-center text-xs text-slate-500">
          Search Social
        </span>
      )}
      <button
        type="button"
        onClick={(e) => void copyScript(e)}
        className="flex min-h-12 items-center justify-center rounded-xl bg-amber-600 px-2 text-center text-xs font-bold text-slate-950"
      >
        {copyState === "copied"
          ? "Copied!"
          : copyState === "error"
            ? "Copy failed"
            : "Copy Script"}
      </button>
    </div>
  );
}
