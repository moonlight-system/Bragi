import { useMemo, useState } from "react";
import { listDeviceMp3s } from "../../nativeAudio";
import type { DeviceMp3 } from "../../nativeAudio";

function Mp3Picker({ onImport, onClose }: {
  onImport: (items: DeviceMp3[]) => void;
  onClose: () => void;
}) {
  const { all } = useMemo(() => {
    try {
      return { all: listDeviceMp3s(), error: null as string | null };
    } catch (e) {
      return { all: [] as DeviceMp3[], error: String(e) };
    }
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState("");

  // the list after the search filter; "all" stays the full list
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(i => i.name.toLowerCase().includes(q) || (i.artist ?? "").toLowerCase().includes(q));
  }, [all, query]);

  const allVisibleSelected = visible.length > 0 && visible.every(i => selected.has(i.id));

  // ticks or unticks everything currently shown, leaving other selections alone
  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach(i => next.delete(i.id));
      else visible.forEach(i => next.add(i.id));
      return next;
    });
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="m_picker">
      <div className="m_sheet_title">
        {all.length === 0 ? "No mp3 files found" : `${all.length} mp3 files`}
      </div>

      <div className="m_picker_tools">
        <input
          className="app_input m_search"
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
        <label className="m_picker_row m_select_all">
          <input type="checkbox" className="m_checkbox" checked={allVisibleSelected} onChange={toggleAll} />
          <div className="m_row_text">
            {query.trim() ? `Select all results (${visible.length})` : `Select all (${visible.length})`}
          </div>
        </label>
      </div>
      
      <div className="m_picker_list">
        {visible.map(item => (
          <label key={item.id} className="m_picker_row">
            <input
              type="checkbox"
              className="m_checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
            />
            <div className="m_row_text">
              <div className="m_picker_name">{item.name}</div>
              <div className="m_item_sub">{item.artist ?? "Unknown Artist"}</div>
            </div>
          </label>
        ))}
        {visible.length === 0 && all.length > 0 && <div className="m_empty">No match</div>}
      </div>
      <div className="m_dialog_buttons m_picker_footer">
        <button className="app_button" onClick={onClose}>Cancel</button>
        <button
          className="app_button"
          disabled={selected.size === 0}
          onClick={() => onImport(all.filter(i => selected.has(i.id)))}
        >Import ({selected.size})</button>
      </div>
    </div>
  );
}

export { Mp3Picker };