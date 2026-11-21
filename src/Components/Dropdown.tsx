import "./Dropdown.css";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type DropdownOption = {
  value: string;
  fontFamily?: string;
  swatches?: string[];   // optional strip of colors shown on the right of the row
};

const MENU_HEIGHT = 260;   // roughly the menu's max height: decides whether it opens downwards or upwards

function Dropdown({ value, options, onChange, placeholder = "Custom" }: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;     // shown when `value` matches no option (e.g. "Custom" theme)
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setOpenUp(window.innerHeight - rect.bottom < MENU_HEIGHT && rect.top > MENU_HEIGHT);
    setHighlight(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  }

  function choose(v: string) {
    setOpen(false);
    onChange(v);
  }

  // keeps the highlighted row visible inside the menu
  useEffect(() => {
    if (!open) return;
    (menuRef.current?.children[highlight] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  // while open, the keyboard belongs to the menu. Capture phase = runs before the app's shortcuts
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight(h => Math.min(options.length - 1, h + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight(h => Math.max(0, h - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (options[highlight]) choose(options[highlight].value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, highlight, options, onChange]);

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className="dropdown_trigger app_input"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}   // no focus: Space keeps pausing the music
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span>{options.some(o => o.value === value) ? value : placeholder}</span>
        <ChevronDown size={18} strokeWidth={3} />
      </button>

      {open && (
        <>
          {/* invisible full-screen layer: a click anywhere outside closes the menu */}
          <div className="dropdown_cover" onClick={() => setOpen(false)} />
          <div className={`dropdown_menu ${openUp ? "dropdown_menu_up" : ""}`} ref={menuRef}>
            {options.map((option, index) => (
              <div
                key={option.value}
                className={`dropdown_option ${index === highlight ? "dropdown_option_highlight" : ""} ${option.value === value ? "dropdown_option_selected" : ""}`}
                style={option.fontFamily ? { fontFamily: option.fontFamily } : undefined}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(option.value)}
              >
                <span className="dropdown_option_label">{option.value}</span>
                {option.swatches && (
                  <span className="dropdown_strip" aria-hidden="true">
                    {option.swatches.map((color, i) => (
                      <span key={i} className="dropdown_strip_cell" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { Dropdown };