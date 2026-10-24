import "./EditableLabel.css";
import { useEffect, useRef, useState } from "react";
import type { ItemEditor } from "./CursorList";

// Shows `value` as plain text, or as an input if the list says this field is being edited.
function EditableLabel({ value, field, editor }: {
  value: string;
  field: string;          // which field of the item this label is ("name", "artist"...)
  editor?: ItemEditor;    // optional: lists that can't rename don't pass it
}) {
  if (!editor || editor.field !== field) return <>{value}</>;
  return <LabelInput initial={value} onCommit={editor.commit} onCancel={editor.cancel} />;
}

function LabelInput({ initial, onCommit, onCancel }: {
  initial: string;
  onCommit: (newValue: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // runs once, when the input appears: focus it with the caret after the last character
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(initial.length, initial.length);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // every key typed here belongs to the field: keep it away from the
    // window-level shortcuts (space = pause, j/l = seek, s = settings...)
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault(); // a textarea would insert a line break otherwise
      if (draft.trim() === initial) onCancel(); // nothing changed: just close
      else onCommit(draft);
    } else if (event.key === "Escape") {
      onCancel();
    }
  }

  return (
    <span className="editable_label">
      {/* invisible copy of the text: it alone decides the size, like the label it replaces */}
      <span className="editable_label_sizer">{draft + " "}</span>
      <textarea
        ref={inputRef}
        className="editable_label_input"
        rows={1}
        value={draft}
        // pasted text can contain line breaks: flatten them
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
        onKeyDown={handleKeyDown}
        // clicking elsewhere abandons the edit (but alt-tabbing away doesn't)
        onBlur={() => { if (document.hasFocus()) onCancel(); }}
        spellCheck={false}
      />
    </span>
  );
}

export { EditableLabel };