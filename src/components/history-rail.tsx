import type { HistoryEntry } from "@/lib/history";
import { citedRefs } from "@/lib/citations";
import { isRefusal } from "@/lib/refusal";

const stamp = (ts: number) => {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

function summary(entry: HistoryEntry): string {
  const pages = isRefusal(entry.answer)
    ? "Not found"
    : [...citedRefs(entry.answer)]
        .map((n) => entry.sources.find((s) => s.rank === n && n <= entry.meta.sendK))
        .filter((s) => s !== undefined)
        .map((s) => (s.printedPage !== null ? `p.${s.printedPage}` : `PDF ${s.pdfPage}`))
        .join(" · ");
  const setup = `${entry.meta.pipeline === "fixed" ? "fixed" : "structured"}${entry.meta.useFilters && entry.meta.pipeline !== "fixed" ? "" : ", no filters"}`;
  return `${pages || "no citations"} · ${setup} · ${stamp(entry.ts)}`;
}

type Props = {
  entries: readonly HistoryEntry[];
  currentId: string | null;
  onOpen: (entry: HistoryEntry) => void;
  onClear: () => void;
  onClose: () => void;
  inert: boolean;
  firstRef: React.Ref<HTMLButtonElement>;
};

export function HistoryRail({ entries, currentId, onOpen, onClear, onClose, inert, firstRef }: Props) {
  return (
    <aside className="rail" id="history-rail" aria-label="Past questions" inert={inert}>
      <div className="col-h">
        Sessions
        {entries.length > 0 ? (
          <button type="button" className="link-btn sp" onClick={onClear}>
            Clear
          </button>
        ) : null}
        <button type="button" className="icon-btn close-d" aria-label="Close past questions" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="grp">THIS BROWSER</p>
      {entries.length === 0 ? (
        <p className="hist-empty">Questions you ask will be listed here so you can reopen them.</p>
      ) : (
        <ul className="history">
          {entries.map((entry, i) => (
            <li key={entry.id}>
              <button
                ref={i === 0 ? firstRef : undefined}
                type="button"
                className={`hist-item${entry.id === currentId ? " is-current" : ""}`}
                aria-current={entry.id === currentId ? "true" : undefined}
                onClick={() => onOpen(entry)}
              >
                <span className="hist-q">{entry.question}</span>
                <span className="hist-m">{summary(entry)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="rail-f">History stays in this browser. Reopening an item doesn&rsquo;t call the model again.</p>
    </aside>
  );
}
