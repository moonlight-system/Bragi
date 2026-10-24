import { useState, useEffect, useRef } from 'react';
import { ChromePicker } from 'react-color';
import './PaletteColorPicker.css';

// roughly the popover's height: decides whether it opens downwards or upwards
const POPOVER_HEIGHT = 300;

function isValidHex(value: string): boolean {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

function PaletteColorPicker({
    color,
    onChangeComplete,
    palette=["#ff0000", "#fc7100", "#ffbb00", "#07d300", "#00ff9d", "#00e6d2", "#1640ff", "#ad009f", "#ff10eb", "#bdbdbd"],
    columns=10,
}: {
    color: string;
    onChangeComplete: (color: { hex: string }) => void;
    palette?: string[];
    columns?: number;
}) {
    const [hexInput, setHexInput] = useState(color);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const hexRowRef = useRef<HTMLDivElement>(null);
    const hexInputRef = useRef<HTMLInputElement>(null);

    // keep the text field in sync if the color changes from outside (e.g. a swatch click)
    useEffect(() => {
        setHexInput(color);
    }, [color]);

    // while the popover is open, Escape closes it instead of leaving the settings screen.
    // `true` = capture phase: this runs before the Settings screen's own Escape listener
    useEffect(() => {
        if (!popoverOpen) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.stopPropagation();
                setPopoverOpen(false);
            }
        }
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [popoverOpen]);

    function openPopover() {
        // not enough room below the field? open upwards
        const rect = hexRowRef.current?.getBoundingClientRect();
        if (rect) setOpenUp(window.innerHeight - rect.bottom < POPOVER_HEIGHT);
        setPopoverOpen(true);
        // make the hex field typable right away, even if the click landed on the row's padding
        const input = hexInputRef.current;
        if (input && document.activeElement !== input) {
            input.focus();
            input.select();   // typing a new code replaces the old one
        }
    }

    function handleSwatchClick(swatchColor: string) {
        onChangeComplete({ hex: swatchColor });
    }

    function handleHexSubmit() {
        if (isValidHex(hexInput)) {
            onChangeComplete({ hex: hexInput });
        } else {
            // invalid input — revert the field back to the last known good color
            setHexInput(color);
        }
    }

    return (
        <div className="palette_picker">
            {popoverOpen && (
                <div className="palette_popover_cover" onClick={() => setPopoverOpen(false)} />
            )}

            <div
                className="palette_swatch_grid"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(columns, palette.length))}, 32px)` }}
            >
                {palette.map((swatchColor) => (
                    <button
                        key={swatchColor}
                        type="button"
                        className={`palette_swatch ${swatchColor.toLowerCase() === color.toLowerCase() ? "palette_swatch_selected" : ""}`}
                        style={{ backgroundColor: swatchColor }}
                        onClick={() => handleSwatchClick(swatchColor)}
                        aria-label={swatchColor}
                    />
                ))}
            </div>

            <div
                className={`palette_hex_row ${popoverOpen ? "palette_hex_row_open" : ""}`}
                ref={hexRowRef}
                onClick={() => { if (!popoverOpen) openPopover(); }}
            >
                <span className="palette_hex_label">#</span>
                <input
                    ref={hexInputRef}
                    className="palette_hex_input"
                    type="text"
                    value={hexInput.replace('#', '')}
                    onChange={(e) => {
                        const next = '#' + e.target.value;
                        setHexInput(next);
                        // a complete 6-digit code applies right away, so the floating picker follows what you type
                        if (/^#[0-9A-Fa-f]{6}$/.test(next)) onChangeComplete({ hex: next });
                    }}
                    onBlur={handleHexSubmit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleHexSubmit();
                    }}
                />

                {popoverOpen && (
                    <>
                        {/* invisible full-screen layer: a click anywhere outside closes the popover */}
                        
                        <div className={`palette_popover ${openUp ? "palette_popover_up" : ""}`}>
                            <ChromePicker
                                color={color}
                                disableAlpha
                                onChange={(c) => onChangeComplete({ hex: c.hex })}
                                styles={{
                                    default: {
                                        color: { display: "none" },     // the little round preview left of the hue line
                                        body: { padding: "12px" },      // the default reserves extra room for the fields we hide
                                    },
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export { PaletteColorPicker };