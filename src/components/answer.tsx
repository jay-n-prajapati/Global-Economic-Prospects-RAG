import { parseCitations } from "@/lib/citations";
import { formatWait } from "@/lib/filters";
import { REFUSAL_TEXT } from "@/lib/refusal";
import type { AskErrorCode, AskMeta, AskSource } from "@/lib/ask-protocol";

// The model sometimes answers with light markdown ("* " bullets, **bold**) despite the plain-text prompt;
// render just those two instead of showing raw asterisks.
const BOLD = /\*\*([^*]+)\*\*/g;

function Inline({ text }: { text: string }) {
  const pieces = text.replace(/^\*\s+/gm, "• ").split(BOLD);
  return pieces.map((piece, i) => (i % 2 ? <strong key={i}>{piece}</strong> : piece));
}

type Node = { kind: "text"; text: string } | { kind: "cite"; refs: number[]; lead: string; trail: string };

// A citation group is kept on the same line as the word before it and the punctuation after it,
// so a line break can never strand a lone chip or period.
function toNodes(paragraph: string): Node[] {
  const nodes: Node[] = [];
  let afterCite = false;
  for (const part of parseCitations(paragraph)) {
    if ("text" in part) {
      let text = part.text;
      if (afterCite) {
        const punct = /^[.,;:)!?'’"”]+/.exec(text)?.[0] ?? "";
        const last = nodes[nodes.length - 1];
        if (punct && last.kind === "cite") {
          last.trail = punct;
          text = text.slice(punct.length);
        }
      }
      if (text) nodes.push({ kind: "text", text });
      afterCite = false;
    } else {
      let lead = "";
      const prev = nodes[nodes.length - 1];
      if (prev?.kind === "text") {
        const word = /\S+\s*$/.exec(prev.text)?.[0] ?? "";
        // Don't split a **bold** run in half.
        if (word && !word.includes("*")) {
          lead = word;
          prev.text = prev.text.slice(0, prev.text.length - word.length);
          if (!prev.text) nodes.pop();
        }
      }
      nodes.push({ kind: "cite", refs: part.refs, lead, trail: "" });
      afterCite = true;
    }
  }
  return nodes;
}

type AnswerProps = {
  text: string;
  streaming: boolean;
  /** Sources the model actually saw, by citation number (rank). */
  sent: ReadonlyMap<number, AskSource>;
  activeRank: number | null;
  onCite: (rank: number) => void;
};

export function Answer({ text, streaming, sent, activeRank, onCite }: AnswerProps) {
  const paragraphs = text.trim().split(/\n{2,}/);
  return (
    <div className="answer">
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="para">
          {toNodes(paragraph).map((node, j) =>
            node.kind === "text" ? (
              <Inline key={j} text={node.text} />
            ) : (
              <span key={j} className="nw">
                {node.lead}
                {node.refs.map((rank, k) => {
                  const source = sent.get(rank);
                  return source ? (
                    <button
                      key={`${rank}-${k}`}
                      type="button"
                      onClick={() => onCite(rank)}
                      aria-label={`Show excerpt ${rank}: ${source.headingPath ?? "unlabeled passage"}`}
                      className={`cite${activeRank === rank ? " is-linked" : ""}`}
                    >
                      {rank}
                      <span className="cp">{source.printedPage !== null ? ` · p.${source.printedPage}` : ` · PDF ${source.pdfPage}`}</span>
                    </button>
                  ) : (
                    <span key={`${rank}-${k}`} className="cite off" title="This number was not among the excerpts sent to the model">
                      {rank}
                      <span className="sr-only"> (not among the excerpts sent to the model)</span>
                    </span>
                  );
                })}
                {node.trail}
              </span>
            ),
          )}
          {streaming && i === paragraphs.length - 1 ? <span className="caret" aria-hidden="true" /> : null}
        </p>
      ))}
    </div>
  );
}

// The refusal is a designed outcome, not an error: the system declining to invent an answer.
export function Verdict({ meta }: { meta: AskMeta | null }) {
  return (
    <div className="verdict">
      <p className="verdict-t">{REFUSAL_TEXT}</p>
      <p className="verdict-s">
        The report doesn&rsquo;t contain an answer to this question, as far as the retrieved passages go. The nearest
        passages are shown as evidence, so you can judge for yourself.
        {meta?.filtersApplied ? " A filter was applied; turn filters off and ask again to see whether that changes the result." : ""}
      </p>
    </div>
  );
}

const ERROR_TITLE: Record<AskErrorCode, string> = {
  quota: "Gemini quota reached",
  invalid: "Check the question",
  unavailable: "Couldn’t finish the answer",
  not_ready: "Index not built yet",
  internal: "Couldn’t finish the answer",
};

type NoticeProps = { code: AskErrorCode; message: string; retryAfterSecs?: number; hasSources: boolean; onRetry: () => void };

export function ErrorNotice({ code, message, retryAfterSecs, hasSources, onRetry }: NoticeProps) {
  return (
    <div className="notice" role="alert">
      <p className="notice-t">{ERROR_TITLE[code]}</p>
      <p className="notice-s">
        {message}
        {code === "quota" && retryAfterSecs ? ` The server says to retry in ${formatWait(retryAfterSecs)}.` : ""}
        {hasSources ? " Retrieval worked, so the passages it found are still listed under Evidence." : ""}
      </p>
      {code !== "invalid" && code !== "not_ready" ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
