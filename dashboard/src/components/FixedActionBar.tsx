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
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
      aria-label="Primary actions"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onFind}
          disabled={disabled}
          className="min-h-[56px] rounded-2xl bg-sky-600 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
        >
          Find
        </button>
        <button
          type="button"
          onClick={onDraft}
          disabled={disabled}
          className="min-h-[56px] rounded-2xl bg-violet-600 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
        >
          Draft
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className="min-h-[56px] rounded-2xl bg-amber-600 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </nav>
  );
}
