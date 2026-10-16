import { segments, type Range } from "@/lib/highlight";
import { describeFilters, kindLabel, pageLabel, splitPath } from "@/lib/filters";
import type { AskMeta, AskSource } from "@/lib/ask-protocol";

export type EvidenceFilter = "all" | "cited";

// Similarity is shown as a short bar; real scores sit roughly between 0.5 and 0.85.
const barWidth = (score: number) => `${Math.round(Math.max(0, Math.min(1, (score - 0.4) / 0.5)) * 100)}%`;

type CardProps = {
  source: AskSource;
  sent: boolean;
  cited: boolean;
  refused: boolean;
  active: boolean;
  flashKey: number;
  ranges: readonly Range[] | undefined;
};

function Card({ source, sent, cited, refused, active, flashKey, ranges }: CardProps) {
  const crumbs = splitPath(source.headingPath);
  const badge = source.box ?? (source.kind && source.kind !== "section" ? kindLabel(source.kind) : null);
  return (
    // flashKey remounts the active card so the flash animation replays on every click.
    <article
      key={active ? `a${flashKey}` : "i"}
      id={`ev-${source.rank}`}
      tabIndex={-1}
      className={`card ${cited ? "cited" : "uncited"}${sent ? "" : " unsent"}${active ? " is-active flash" : ""}`}
    >
      <header className="card-h">
        <span className="rk" title={sent ? "Citation number the model uses for this passage" : "Retrieved, but not sent to the model"}>
          {source.rank}
        </span>
        <span className="pg">{pageLabel(source.printedPage, source.pdfPage)}</span>
        <span className="score" title="Cosine similarity to your question (higher is closer)">
          <i style={{ "--w": barWidth(source.score) } as React.CSSProperties} />
          <b>{source.score.toFixed(3)}</b>
        </span>
      </header>
      {crumbs.length > 0 ? (
        <ol className="path" aria-label="Location in the report">
          {crumbs.map((crumb, i) => (
            <li key={i}>{crumb}</li>
          ))}
        </ol>
      ) : (
        <p className="path none">Unlabeled passage (fixed-size chunk, no section path)</p>
      )}
      <p className="tags">
        <span className="tag">{refused ? "Nearest passage" : cited ? "Cited" : sent ? "Sent, not cited" : "Not sent to model"}</span>
        {badge ? <span className="badge">{badge}</span> : null}
        {source.region ? <span className="badge dim">{source.region}</span> : null}
      </p>
      <p className="excerpt">
        {segments(source.content, ranges).map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : s.text))}
      </p>
    </article>
  );
}

type PaneProps = {
  view: "empty" | "searching" | "streaming" | "answer" | "refusal" | "error";
  sources: readonly AskSource[];
  meta: AskMeta | null;
  citedRefs: ReadonlySet<number>;
  highlights: ReadonlyMap<number, readonly Range[]>;
  activeRank: number | null;
  flashKey: number;
  filter: EvidenceFilter;
  onFilter: (filter: EvidenceFilter) => void;
  onClose: () => void;
  inert: boolean;
  closeRef: React.Ref<HTMLButtonElement>;
};

export function EvidencePane({
  view,
  sources,
  meta,
  citedRefs,
  highlights,
  activeRank,
  flashKey,
  filter,
  onFilter,
  onClose,
  inert,
  closeRef,
}: PaneProps) {
  const refused = view === "refusal";
  const sendK = meta?.sendK ?? sources.length;
  const citedCount = sources.filter((s) => citedRefs.has(s.rank)).length;
  const filters = meta ? describeFilters(meta) : null;
  return (
    <aside className="evidence" id="evidence-pane" aria-label="Evidence" inert={inert}>
      <div className="col-h">
        <span>{refused ? "Nearest passages" : "Evidence"}</span>
        {sources.length > 0 && !refused ? (
          <span className="tabs" role="group" aria-label="Filter passages">
            <button type="button" aria-pressed={filter === "all"} onClick={() => onFilter("all")}>
              All<b>{sources.length}</b>
            </button>
            <button type="button" aria-pressed={filter === "cited"} onClick={() => onFilter("cited")}>
              Cited<b>{citedCount}</b>
            </button>
          </span>
        ) : null}
        <button ref={closeRef} type="button" className="icon-btn sheet-only sp" aria-label="Close evidence" onClick={onClose}>
          ✕
        </button>
      </div>

      {meta && view !== "empty" && view !== "searching" ? (
        <div className="scope" data-applied={filters?.applied}>
          <p>
            <b>Filters applied:</b> {filters?.text}
          </p>
          <p className="scope-m">
            Pipeline: {meta.pipeline === "fixed" ? "fixed-size chunks" : "structured chunks"} · top {sources.length} retrieved, first{" "}
            {Math.min(sendK, sources.length)} sent to the model
          </p>
        </div>
      ) : null}

      {view === "empty" ? (
        <div className="ev-empty">
          <p>
            <b>Passages appear here.</b> The closest to your question, each with its place in the report (chapter &gt;
            section), printed and PDF page, and a similarity score.
          </p>
          <p>
            <b>Citation chips are links.</b> Click a number in the answer to jump to the passage it cites.
          </p>
          <p>
            <b>Filters line.</b> Shows whether a region or chapter in your question narrowed the search. Turn filters off, or
            switch to fixed-size chunks, to compare the same question.
          </p>
        </div>
      ) : view === "searching" ? (
        <div className="cards" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card skeleton">
              <i />
              <i />
              <i />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="cards" data-filter={refused ? "all" : filter}>
            {sources.map((source) => (
              <Card
                key={source.id}
                source={source}
                sent={source.rank <= sendK}
                cited={citedRefs.has(source.rank)}
                refused={refused}
                active={activeRank === source.rank}
                flashKey={flashKey}
                ranges={highlights.get(source.id)}
              />
            ))}
            {sources.length === 0 ? (
              <p className="hist-empty">No passages were retrieved for this question.</p>
            ) : null}
          </div>
          {sources.length > 0 ? (
            <div className="legend">
              <mark>shared wording</mark>
              <span>number = citation</span>
              <span className="sp">cosine similarity</span>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
