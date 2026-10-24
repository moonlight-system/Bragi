import { useState } from "react";
import { THEME_PRESETS } from "../Screens/SettingsScreen";
import { getCssVariable } from "../../types_and_functions";
import { FONT_OPTIONS, FONT_SIZE_OPTIONS } from "../../fonts";

function MobileSettings({ onColorsChange, backOnRight, onBackOnRightChange, font, onFontChange, fontSize, onFontSizeChange }: {
  onColorsChange: (changes: Record<string, string>) => void;
  backOnRight: boolean;
  onBackOnRightChange: (value: boolean) => void;
  font: string; 
  onFontChange: (name: string) => void;
  fontSize: string;
  onFontSizeChange: (name: string) => void;
}) {
  // the preset matching the current CSS variables (empty = "Custom")
  const [active, setActive] = useState(() =>
    THEME_PRESETS.find(preset =>
      Object.entries(preset.colors).every(
        ([variable, hex]) => getCssVariable(variable).toLowerCase() === hex.toLowerCase()
      )
    )?.name ?? ""
  );

  function choose(name: string) {
    const preset = THEME_PRESETS.find(p => p.name === name);
    if (!preset) return;
    for (const [variable, hex] of Object.entries(preset.colors)) {
      document.documentElement.style.setProperty(variable, hex);   // live theme
    }
    onColorsChange(preset.colors);                                  // saved by App
    setActive(name);
  }

  return (
    <div className="m_settings">
      <div className="m_setting_row">
        <div>Preset themes</div>
        <select className="app_input m_select" value={active} onChange={(e) => choose(e.target.value)}>
          <option value="" disabled>Custom</option>
          {THEME_PRESETS.map(preset => (
            <option key={preset.name} value={preset.name}>{preset.name}</option>
          ))}
        </select>
      </div>

      <div className="m_setting_row" style={{ marginTop: "1.5rem" }}>
        <div>Font</div>
        <select className="app_input m_select" value={font} onChange={(e) => onFontChange(e.target.value)}>
          {FONT_OPTIONS.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
      </div>

      <div className="m_setting_row" style={{ marginTop: "1.5rem" }}>
        <div>Font size</div>
        <select className="app_input m_select" value={fontSize} onChange={(e) => onFontSizeChange(e.target.value)}>
          {FONT_SIZE_OPTIONS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      <div className="m_setting_row" style={{ marginTop: "1.5rem" }}>
        <div>Back button on the right</div>
        <input
          type="checkbox"
          className="m_checkbox"
          checked={backOnRight}
          onChange={(e) => onBackOnRightChange(e.target.checked)}
        />
      </div>
    </div>
  );
}

export { MobileSettings };