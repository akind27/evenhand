/** Quiet, factual line shown with every AI result (EU AI Act Article 50). */
export function AiLabel() {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft">
      <span aria-hidden="true" className="mono border border-ink-soft px-1 text-[0.6875rem] font-medium leading-4">
        AI
      </span>
      AI-assisted — a person decides any charge.
    </p>
  );
}
