import { useLayoutEffect } from "react";
import { MAX_QUESTION_LENGTH, type Pipeline } from "@/lib/ask-protocol";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  useFilters: boolean;
  onUseFilters: (on: boolean) => void;
  pipeline: Pipeline;
  onPipeline: (pipeline: Pipeline) => void;
};

export function Composer({ value, onChange, onSubmit, onStop, busy, inputRef, useFilters, onUseFilters, pipeline, onPipeline }: Props) {
  // Grow with the content up to the CSS max-height.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, inputRef]);

  const remaining = MAX_QUESTION_LENGTH - value.length;
  const fixed = pipeline === "fixed";
  return (
    <div className="composer">
      <div className="in">
        <div className="opts" role="group" aria-label="Retrieval options for the next question">
          <span className="opt">
            <span className="opt-l" id="opt-filters">
              Filters
            </span>
            <span className="seg" role="group" aria-labelledby="opt-filters">
              <button type="button" aria-pressed={useFilters && !fixed} disabled={fixed} onClick={() => onUseFilters(true)}>
                On
              </button>
              <button type="button" aria-pressed={!useFilters || fixed} disabled={fixed} onClick={() => onUseFilters(false)}>
                Off
              </button>
            </span>
          </span>
          <span className="opt">
            <span className="opt-l" id="opt-pipeline">
              Pipeline
            </span>
            <span className="seg" role="group" aria-labelledby="opt-pipeline">
              <button type="button" aria-pressed={!fixed} onClick={() => onPipeline("structured")}>
                Structured
              </button>
              <button type="button" aria-pressed={fixed} onClick={() => onPipeline("fixed")}>
                Fixed-size
              </button>
            </span>
          </span>
        </div>
        <form
          className="askbar"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) onStop();
            else onSubmit();
          }}
        >
          <label className="sr-only" htmlFor="composer-input">
            Ask a question about the report
          </label>
          <textarea
            ref={inputRef}
            id="composer-input"
            name="question"
            rows={1}
            value={value}
            maxLength={MAX_QUESTION_LENGTH}
            enterKeyHint="send"
            placeholder="Ask about the report…"
            aria-describedby="composer-hint"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy) onSubmit();
              }
            }}
          />
          <button type="submit" className="send" data-busy={busy} disabled={!busy && !value.trim()}>
            {busy ? "Stop" : "Ask"}
            <kbd aria-hidden="true">{busy ? "esc" : "↵"}</kbd>
          </button>
        </form>
        <p id="composer-hint" className="askhint">
          Each question is answered on its own &mdash; follow-ups aren&rsquo;t remembered. <kbd>/</kbd> focuses the
          box, <kbd>Shift ↵</kbd> adds a line.
          {remaining <= 100 ? <span className="count"> {remaining} characters left.</span> : null}
        </p>
      </div>
    </div>
  );
}
