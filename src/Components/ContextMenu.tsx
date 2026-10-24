import "./ContextMenu.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MenuEntry = {
    label: string;
    onSelect: () => void;
    danger?: boolean;
};

// A small floating menu. (x, y) is where its top-left corner wants to be (the mouse
// position, or just under a ⋮ button); it is nudged back inside the window if needed.
function ContextMenu({ x, y, entries, onClose }: {
    x: number;
    y: number;
    entries: MenuEntry[];
    onClose: () => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: x, top: y });

    // measured before the first paint, so the menu never flashes in the wrong place
    useLayoutEffect(() => {
        const rect = menuRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPosition({
            left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
            top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
        });
    }, [x, y]);

    // Escape closes the menu. Capture phase = runs before the other Escape listeners
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
            }
        }
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [onClose]);

    // rendered in document.body so the lists' CSS (".playlist_list div { font-size... }")
    // can't leak into it
    return createPortal(
        <>
            {/* invisible full-screen layer: a click anywhere outside closes the menu */}
            <div
                className="context_menu_cover"
                onMouseDown={onClose}
                onContextMenu={(e) => { e.preventDefault(); onClose(); }}
            />
            <div className="context_menu" ref={menuRef} style={{ left: position.left, top: position.top }}>
                {entries.map((entry) => (
                    <button
                        key={entry.label}
                        type="button"
                        className={`context_menu_item ${entry.danger ? "context_menu_item_danger" : ""}`}
                        onClick={() => { onClose(); entry.onSelect(); }}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>
        </>,
        document.body,
    );
}

export { ContextMenu };
export type { MenuEntry };