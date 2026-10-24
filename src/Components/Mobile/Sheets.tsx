import { useState, useRef, useEffect } from "react";

export type SheetAction = { label: string; onPick: () => void; danger?: boolean };

// bottom sheet with a list of choices
function ActionSheet({ title, actions, onClose }: {
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <div className="m_overlay" onClick={onClose}>
      <div className="m_sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m_sheet_title">{title}</div>
        {actions.map((a) => (
          <button
            key={a.label}
            className={`m_sheet_btn ${a.danger ? "m_sheet_danger" : ""}`}
            // close first, then run: if the action opens another dialog, that one wins
            onClick={a.onPick}
          >{a.label}</button>
        ))}
      </div>
    </div>
  );
}

// centered dialog with one text field
function TextPrompt({ title, initial = "", onSubmit, onClose }: {
  title: string;
  initial?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function submit() {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    onClose();
  }

  return (
    <div className="m_overlay m_overlay_center" onClick={onClose}>
      <div className="m_dialog" onClick={(e) => e.stopPropagation()}>
        <div className="m_sheet_title">{title}</div>
        <input
          className="app_input m_dialog_input"
          ref={inputRef}
          value={value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <div className="m_dialog_buttons">
          <button className="app_button" onClick={onClose}>Cancel</button>
          <button className="app_button" onClick={submit}>OK</button>
        </div>
      </div>
    </div>
  );
}

export { ActionSheet, TextPrompt };