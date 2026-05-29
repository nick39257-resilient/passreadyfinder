function IconFind() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" strokeLinecap="round" />
    </svg>
  );
}

function IconDraft() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinejoin="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
    </svg>
  );
}

export function FixedActionBar({
  onFind,
  onDraft,
  onSend,
  disabled,
}: {
  onFind: () => void;
  onDraft: () => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  const btn =
    "flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-semibold leading-tight transition active:scale-[0.98] disabled:opacity-45";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-700/80 bg-[#070f14]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md"
      aria-label="Outreach workflow"
    >
      <p className="mb-1 text-center text-[9px] font-medium uppercase tracking-[0.15em] text-slate-600">
        Find · Draft · Send
      </p>
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onFind}
          disabled={disabled}
          className={`${btn} bg-sky-950/80 text-sky-200 ring-1 ring-sky-500/25`}
        >
          <IconFind />
          <span>Check changes</span>
        </button>
        <button
          type="button"
          onClick={onDraft}
          disabled={disabled}
          className={`${btn} bg-violet-950/80 text-violet-200 ring-1 ring-violet-500/25`}
        >
          <IconDraft />
          <span>Auto-draft all</span>
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className={`${btn} bg-amber-950/80 text-amber-200 ring-1 ring-amber-500/25`}
        >
          <IconSend />
          <span>Send now</span>
        </button>
      </div>
    </nav>
  );
}
