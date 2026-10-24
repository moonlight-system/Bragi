import { useEffect, useState } from "react";
import './SettingsScreen.css';
import { CursorList } from "../CursorList";
import { PaletteColorPicker } from "../PaletteColorPicker";
import { getCssVariable } from "../../types_and_functions";
import { FONT_OPTIONS, FONT_SIZE_OPTIONS } from "../../fonts";
import { ArrowLeft } from "lucide-react";

const ACCENT_PALETTE = [
    "#ff0000", "#fc7100", "#ffbb00", "#07d300", "#00ff9d", "#00e6d2", "#1640ff", "#ad009f", "#ff10eb", "#d8d8d8",
    "#ff4848", "#ff9f50", "#ffd45f", "#64ff5f", "#67ffc5", "#78fff4", "#5c7aff", "#8d3b86", "#ff79f4", "#353535",
];

type ThemeSetting = {
    label: string;
    variable: string;
    palette: string[];
    underGlobal?: boolean;
};

const GLOBAL_ACCENT = "--global-accent-color";

const THEME_SETTINGS: ThemeSetting[] = [
    { label: "Global accent color", variable: GLOBAL_ACCENT, palette: ACCENT_PALETTE },
    { label: "Title color", variable: "--title-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Playlists panel color", variable: "--playlist-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Songs panel color", variable: "--songs-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Buttons color", variable: "--button-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Song name color", variable: "--song-name-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Progress bar color", variable: "--progress-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Player buttons color", variable: "--buttons-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Visualizer color", variable: "--visualizer-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    { label: "Settings side panel color", variable: "--settings-side-accent-color", palette: ACCENT_PALETTE, underGlobal: true },
    {
        label: "Primary background color", variable: "--primary-bg-color",
        palette: ["#25252B", "#393949", "#525269", "#cacaca", "#d0d0ee", "#e6d7c3", "#cfcfcf"],
    },
    {
        label: "Secondary background color", variable: "--secondary-bg-color",
        palette: ["#1c1c20", "#31313b", "#434355", "#a8a8a8", "#bebee7", "#dcc8ac", "#bfbfbf"],
    },
    {
        label: "Tertiary background color", variable: "--tertiary-bg-color",
        palette: ["#141418", "#272731", "#3a3a4d", "#969696", "#acacdd", "#dcc8ac", "#bfbfbf"],
    },
    { label: "Text color", variable: "--text-color", palette: ["#0f0f0f", "#ffffff"] },
];

type ThemePreset = {
    name: string;
    dark?: boolean;                   // true = shown with a dark background in the dropdown
    colors: Record<string, string>;   // CSS variable -> color, for every setting
};

// builds a full preset: one accent for everything under the global setting,
// plus optional per-setting overrides
function buildPreset(
    accent: string,
    backgrounds: [string, string, string],   // primary, secondary, tertiary
    text: string,
    overrides: Record<string, string> = {},
): Record<string, string> {
    const colors: Record<string, string> = {
        [GLOBAL_ACCENT]: accent,
        "--primary-bg-color": backgrounds[0],
        "--secondary-bg-color": backgrounds[1],
        "--tertiary-bg-color": backgrounds[2],
        "--text-color": text,
    };
    for (const setting of THEME_SETTINGS) {
        if (setting.underGlobal) colors[setting.variable] = accent;
    }
    return { ...colors, ...overrides };
}

const THEME_PRESETS: ThemePreset[] = [
    { 
        name: "Bragi", 
        dark: true,
        colors: buildPreset("#00ff9d", ["#25252B", "#1c1c20", "#141418"], "#ffffff") 
    },
    { 
        name: "Midnight", 
        dark: true,
        colors: buildPreset("#5c7aff", ["#1b1f33", "#151827", "#0f1220"], "#ffffff") 
    },
    {
        name: "Sunset",
        dark: true,
        colors: buildPreset("#ff9f50", ["#2a1f26", "#221a20", "#1a1418"], "#ffffff", {
            "--title-accent-color": "#ff4848",
            "--progress-accent-color": "#ff9148",
            "--visualizer-accent-color": "#ffd45f",
        }),
    },
    {
        name: "Espresso",
        dark: true,
        colors: buildPreset("#d9a066", ["#2b1f19", "#231915", "#1a110e"], "#efe3d0", {
            "--title-accent-color": "#f2d3a4",
            "--visualizer-accent-color": "#c8864a",
        }),
    },
    {
        name: "Red Velvet",
        dark: true,
        colors: buildPreset("#e5383b", ["#1a0b0d", "#130709", "#0c0405"], "#f2e6e6", {
            "--title-accent-color": "#c1121f",
            "--visualizer-accent-color": "#ff5a5f",
        }),
    },
    {
        name: "Adrien",
        dark: true,
        colors: buildPreset("#910000", ["#1a1a1a", "#121212", "#070707"], "#f2e6e6",),
    },
    {
        name: "Forest",
        dark: true,
        colors: buildPreset("#34c17b", ["#16251c", "#101c15", "#0b130e"], "#e6f2e4", {
            "--title-accent-color": "#b9e4a3",
            "--visualizer-accent-color": "#7ddf64",
        }),
    },
    {
        name: "Synthwave",
        dark: true,
        colors: buildPreset("#ff3cac", ["#241734", "#1b1027", "#130a1c"], "#f3e9ff", {
            "--title-accent-color": "#2de2e6",
            "--visualizer-accent-color": "#2de2e6",
            "--progress-accent-color": "#ffd319",
        }),
    },
    {
        name: "Graphite",
        dark: true,
        colors: buildPreset("#f5f5f5", ["#262626", "#1c1c1c", "#121212"], "#a8a8a8", {
            "--title-accent-color": "#ffffff",
            "--visualizer-accent-color": "#d0d0d0",
        }),
    },
    {
        name: "Amethyst",
        dark: true,
        colors: buildPreset("#b794f6", ["#231a33", "#1a1327", "#120c1c"], "#e9e1f5", {
            "--title-accent-color": "#d6bcfa",
            "--visualizer-accent-color": "#9f7aea",
        }),
    },
    {
        name: "Ocean",
        dark: true,
        colors: buildPreset("#ff8a75", ["#0f2a33", "#0b2028", "#07161c"], "#e0f2f1", {
            "--title-accent-color": "#ffb199",
            "--visualizer-accent-color": "#4fd1c5",
        }),
    },
    {
        name: "Amber",
        dark: true,
        colors: buildPreset("#ffcc4d", ["#17120b", "#110d08", "#0b0805"], "#a87927", {
            "--visualizer-accent-color": "#ffa726",
        }),
    },
    {
        name: "Black Pink",
        dark: true,
        colors: buildPreset("#f038e7", ["hsl(320, 10%, 20%)", "hsl(320, 20%, 13%)", "hsl(320, 60%, 6%)"], "#f5dede", {
            "--title-accent-color": "#f038e7",
            "--songs-accent-color": "#f038e7",
            "--progress-accent-color": "#f038e7",
            "--visualizer-accent-color": "#ffffff",
        }),
    },

    {
        name: "Angel",
        colors: buildPreset("#009baf", ["#f4f2ee", "#dae5e6", "#becccf"], "#2b2b2e", {
            "--title-accent-color": "#009baf",
            "--visualizer-accent-color": "#009baf",
        }),
    },
    {
        name: "Latte",
        colors: buildPreset("#a55c2e", ["#efe3d0", "#e1d0b8", "#d2bd9f"], "#3b2a20", {
            "--title-accent-color": "#a55c2e",
            "--visualizer-accent-color": "#e6b251",
        }),
    },
    {
        name: "Mango",
        colors: buildPreset("#c9341c", ["#FFF1D6", "#FFE0B0", "#FFCB91"], "#3d1f14", {
            "--title-accent-color": "#a3260f",
            "--visualizer-accent-color": "#f26b1d",
        }),
    },
    {
        name: "Trans rights !!",
        colors: buildPreset("#cf1b6e", ["#fbf6f9", "#d9eef8", "#f6d8e3"], "#2a1f33", {
            "--songs-accent-color": "#0e78ab",
            "--song-name-accent-color": "#0e78ab",
            "--progress-accent-color": "#0e78ab",
            "--visualizer-accent-color": "#2b98ca",
        }),
    },
    {
        name: "Matcha",
        colors: buildPreset("#3f6b2a", ["#e8efd9", "#d8e3c2", "#c6d4a8"], "#25331b", {
            "--title-accent-color": "#2a4a1a",
            "--visualizer-accent-color": "#6a994e",
        }),
    },
    {
        name: "Lilac",
        colors: buildPreset("#7048b8", ["#f1ecf8", "#e5ddf1", "#d7cbe6"], "#2e2640", {
            "--title-accent-color": "#4f2f8a",
            "--visualizer-accent-color": "#9b7fd4",
        }),
    },
    {
        name: "Vanilla",
        colors: buildPreset("#e49400", ["#fdf3d8", "#f8e6b8", "#f0d796"], "#5c3d0a", {
            "--title-accent-color": "#e49400",
            "--visualizer-accent-color": "#ffc400",
        }),
    },
    {
        name: "Rose Garden",
        colors: buildPreset("#c2406a", ["#f8ecec", "#f0dcdc", "#e6c9cb"], "#3b2530", {
            "--title-accent-color": "#3f6b4d",
            "--songs-accent-color": "#3f6b4d",
            "--progress-accent-color": "#c2406a",
            "--visualizer-accent-color": "#6f9c78",
        }),
    },
];

function SettingsScreen({ onswitchToHomeScreen, onColorsChange, showKeybinds, onShowKeybindsChange, font, onFontChange, fontSize, onFontSizeChange }: {
    onswitchToHomeScreen: () => void;
    onColorsChange: (changes: Record<string, string>) => void;
    showKeybinds: boolean;
    onShowKeybindsChange: (value: boolean) => void;
    font: string;
    onFontChange: (name: string) => void;
    fontSize: string;
    onFontSizeChange: (name: string) => void;
}){

    const categories = ["Theme"];
    const [categoryIndex, setCategoryIndex] = useState(0);

    // current value of every setting, keyed by CSS variable name
    const [colors, setColors] = useState<Record<string, string>>(() =>
        Object.fromEntries(THEME_SETTINGS.map(s => [s.variable, getCssVariable(s.variable)]))
    );

    // applies a batch of changes: UI state, live CSS, and (via App) the preferences file
    function applyColors(changes: Record<string, string>) {
        setColors(prev => ({ ...prev, ...changes }));
        for (const [variable, hex] of Object.entries(changes)) {
            document.documentElement.style.setProperty(variable, hex);
        }
        onColorsChange(changes);
    }

    function changeColor(variable: string, hex: string) {
        const changes: Record<string, string> = { [variable]: hex };
        // the global setting also pushes its color to every setting under it
        if (variable === GLOBAL_ACCENT) {
            for (const setting of THEME_SETTINGS) {
                if (setting.underGlobal) changes[setting.variable] = hex;
            }
        }
        applyColors(changes);
    }

    // the preset whose colors all match the current ones (none = "Custom")
    const activePreset = THEME_PRESETS.find(preset =>
        Object.entries(preset.colors).every(
            ([variable, hex]) => colors[variable]?.toLowerCase() === hex.toLowerCase()
        )
    );

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent){
            if (event.code === "Escape"){
                console.log("escape");
                onswitchToHomeScreen();
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    })

    return (
        <div className="settings_screen_container">
            <div className="side_panel">

                <button
                    className="settings_back_button"
                    tabIndex={-1}
                    title="Back (Esc)"
                    aria-label="Back"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onswitchToHomeScreen}
                >
                    <ArrowLeft size={28} strokeWidth={3} />
                </button>

                <CursorList
                    className="category_list"
                    items={categories}
                    keyExtractor={(category) => category}
                    renderItem={(category, isSelected) => (
                        <div className="setting_category_item" style={{ color: isSelected ? "var(--settings-side-accent-color)" : "var(--text-color)" }}>
                            {category}
                        </div>
                    )}
                    selectedIndex={categoryIndex}
                    onSelectedIndexChange={setCategoryIndex}
                />
            </div>

            <div className="main_settings_panel">
                {categoryIndex===0 && (
                    <div className="theme_settings_container">

                        <div className="setting">
                            <div className="setting_label">Preset themes</div>
                            <div className="setting_control">
                                <select
                                    className="preset_select app_input"
                                    value={activePreset?.name ?? ""}
                                    data-dark={activePreset?.dark ? "true" : "false"}
                                    onChange={(e) => {
                                        const preset = THEME_PRESETS.find(p => p.name === e.target.value);
                                        if (preset) applyColors(preset.colors);
                                        e.target.blur();   // hand the keyboard back to the app's shortcuts
                                    }}
                                    // keep typing in the dropdown away from the window shortcuts (Escape still leaves)
                                    onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation(); }}
                                >
                                    <option value="" disabled>Custom</option>
                                    {THEME_PRESETS.map(preset => (
                                        <option
                                            key={preset.name}
                                            value={preset.name}
                                            className={preset.dark ? "preset_option_dark" : "preset_option_light"}
                                        >{preset.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="setting">
                            <div className="setting_label">Font</div>
                            <div className="setting_control">
                                <select
                                    className="preset_select app_input"
                                    value={font}
                                    onChange={(e) => { onFontChange(e.target.value); e.target.blur(); }}
                                    onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation(); }}
                                >
                                    {FONT_OPTIONS.map(f => (
                                        <option key={f.name} value={f.name} style={{ fontFamily: f.family }}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="setting">
                            <div className="setting_label">Font size</div>
                            <div className="setting_control">
                                <select
                                    className="preset_select app_input"
                                    value={fontSize}
                                    onChange={(e) => { onFontSizeChange(e.target.value); e.target.blur(); }}
                                    onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation(); }}
                                >
                                    {FONT_SIZE_OPTIONS.map(s => (
                                        <option key={s.name} value={s.name}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="setting">
                            <div className="setting_label">Show keybinds</div>
                            <input
                                type="checkbox"
                                className="setting_checkbox"
                                checked={showKeybinds}
                                onChange={(e) => {
                                    onShowKeybindsChange(e.target.checked);
                                    e.target.blur();   // otherwise Space would toggle the box instead of pausing the music
                                }}
                            />
                        </div>

                        {THEME_SETTINGS.map((setting) => (
                            <div className="setting" key={setting.variable}>
                                <div className={`setting_label ${setting.underGlobal ? "setting_label_indented" : ""}`}>{setting.label}</div>
                                <div className="setting_control">
                                    <PaletteColorPicker
                                        color={colors[setting.variable]}
                                        onChangeComplete={(color) => changeColor(setting.variable, color.hex)}
                                        palette={setting.palette}
                                    />
                                </div>
                                
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )

}

export {SettingsScreen, THEME_PRESETS};