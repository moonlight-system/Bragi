import { useState } from "react";
import { THEME_PRESETS, THEME_OPTIONS } from "../Screens/SettingsScreen";
import { getCssVariable } from "../../types_and_functions";
import { FONT_OPTIONS, FONT_SIZE_OPTIONS, LETTER_SPACING_OPTIONS } from "../../fonts";
import { Dropdown } from "../Dropdown";

function MobileSettings({ onColorsChange, backOnRight, onBackOnRightChange, font, onFontChange, fontSize, onFontSizeChange, letterSpacing, onLetterSpacingChange, onOpenTransfer }: {
  onColorsChange: (changes: Record<string, string>) => void;
  backOnRight: boolean;
  onBackOnRightChange: (value: boolean) => void;
  font: string;
  onFontChange: (name: string) => void;
  fontSize: string;
  onFontSizeChange: (name: string) => void;
  letterSpacing: string;
  onLetterSpacingChange: (name: string) => void;
  onOpenTransfer: () => void;
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
      <div className="m_setting_row m_setting_stack">
        <div>Preset themes</div>
        <div className="m_dropdown">
          <Dropdown value={active} options={THEME_OPTIONS} onChange={choose} />
        </div>
      </div>

      <div className="m_setting_row m_setting_stack" style={{ marginTop: "1.5rem" }}>
        <div>Font</div>
        <div className="m_dropdown">
          <Dropdown
            value={font}
            options={FONT_OPTIONS.map(f => ({ value: f.name, fontFamily: f.family }))}
            onChange={onFontChange}
          />
        </div>
      </div>

      <div className="m_setting_row m_setting_stack" style={{ marginTop: "1.5rem" }}>
        <div>Font size</div>
        <div className="m_dropdown">
          <Dropdown
            value={fontSize}
            options={FONT_SIZE_OPTIONS.map(s => ({ value: s.name }))}
            onChange={onFontSizeChange}
          />
        </div>
      </div>

      <div className="m_setting_row m_setting_stack" style={{ marginTop: "1.5rem" }}>
        <div>Letter spacing</div>
        <div className="m_dropdown">
          <Dropdown
            value={letterSpacing}
            options={LETTER_SPACING_OPTIONS.map(o => ({ value: o.name }))}
            onChange={onLetterSpacingChange}
          />
        </div>
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

      <div className="m_setting_row" style={{ marginTop: "2rem" }}>
        <button className="app_button" style={{ width: "100%", borderRadius: 4 }} onClick={onOpenTransfer}>
          Transfer songs and playlists
        </button>
      </div>
    </div>
  );
}

export { MobileSettings };