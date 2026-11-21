import "./CursorList.css";
import { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { EllipsisVertical } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import type { MenuEntry } from "./ContextMenu";

// one text field of an item that can be edited in place (from the ⋮ / right-click menu)
interface EditableField<T> {
    id: string;                                 // e.g. "name" or "artist"
    label?: string;                             // shown in the ⋮ menu, e.g. "Rename song"
    onCommit: (item: T, newValue: string) => void;
}

// handed to renderItem so an item can show an input instead of its label
type ItemEditor = {
    field: string | null;                       // field being edited on this item (null = none)
    commit: (newValue: string) => void;
    cancel: () => void;
};

// lets a parent start "create" mode (the + button, the n key)
type CursorListHandle = {
    startCreating: () => void;
};

// an extra entry for the ⋮ / right-click menu, on top of rename and delete
type ExtraAction<T> = {
    label: string | ((item: T) => string);
    visible?: (item: T) => boolean;
    onSelect: (item: T) => void;
};

interface CursorListProps<T>{
    className?: string;
    items: T[];
    keyExtractor: (item: T) => string;
    renderItem: (item: T, editor: ItemEditor) => React.ReactNode;
    onActivate?: (item: T) => void;
    onCreate?: (name: string) => void;
    onDelete?: (item: T) => void;
    editableFields?: EditableField<T>[];
    onReorder?: (item: T, direction: "up" | "down") => void;
    onModeChange?: (mode: "idle" | "creating" | "renaming") => void;
    deleteLabel?: string;
    extraActions?: ExtraAction<T>[];
    ref?: React.Ref<CursorListHandle>;
}

function CursorList<T>({
    className,
    items,
    keyExtractor,
    renderItem,
    onActivate,
    onCreate,
    onDelete,
    editableFields,
    onReorder,
    onModeChange,
    deleteLabel = "Delete",
    extraActions,
    ref,
}: CursorListProps<T>){
    const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [mode, setMode] = useState<"idle" | "creating" | "renaming">("idle");
    const [editing, setEditing] = useState<{ key: string; field: string } | null>(null);
    const [textInput, setTextInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);

    // --- drag to reorder (hold Shift, press a row, move the mouse) ---
    const [shiftHeld, setShiftHeld] = useState(false);
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const dragMode = shiftHeld && !!onReorder && mode === "idle";
    const handlesVisible = dragMode || draggingKey !== null;   // true = handles replace the ⋮ buttons
    const dragIndexRef = useRef<number | null>(null);          // row being dragged (follows the item as it swaps)
    const swapPendingRef = useRef(false);                      // a swap was requested but not rendered yet
    const suppressClickRef = useRef(false);                    // stops the click that ends a drag from activating the row

    // handlers registered on window must see the latest props, not the ones from when the drag started
    const latest = useRef({ items, onReorder });
    latest.current = { items, onReorder };

    // the list was re-rendered with the new order: the next swap may happen
    useEffect(() => {
        swapPendingRef.current = false;
    }, [items]);

    useEffect(() => {
        if (mode === "creating") inputRef.current?.focus();
        onModeChange?.(mode);
    }, [mode]);

    // is Shift currently held? (blur covers releasing it while the window is unfocused)
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(true); };
        const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(false); };
        const onBlur = () => setShiftHeld(false);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, []);

    function startDrag(e: React.MouseEvent, index: number) {
        if (e.button !== 0 || !dragMode || !onReorder || mode !== "idle") return;
        if ((e.target as HTMLElement).closest(".item_menu_button")) return;   // the ⋮ button is not a drag start
        e.preventDefault();   // no text selection while dragging

        dragIndexRef.current = index;
        setDraggingKey(keyExtractor(items[index]));
        let moved = false;
        document.body.style.cursor = "grabbing";

        function onMove(ev: MouseEvent) {
            const current = dragIndexRef.current;
            if (current === null || swapPendingRef.current) return;
            const { items: list, onReorder: reorder } = latest.current;

            // the row under the mouse (above the first row = first, below the last = last)
            let target = list.length - 1;
            for (let i = 0; i < list.length; i++) {
                const row = rowRefs.current[i];
                if (row && ev.clientY < row.getBoundingClientRect().bottom) {
                    target = i;
                    break;
                }
            }
            if (target === current) return;

            // one step at a time: wait for the list to re-render before the next one
            const goingDown = target > current;
            swapPendingRef.current = true;
            reorder?.(list[current], goingDown ? "down" : "up");
            dragIndexRef.current = goingDown ? current + 1 : current - 1;
            moved = true;
        }

        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            dragIndexRef.current = null;
            setDraggingKey(null);
            if (moved) {
                suppressClickRef.current = true;   // the click that follows this mouseup must not activate the row
                setTimeout(() => { suppressClickRef.current = false; }, 0);
            }
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    function startCreating() {
        if (!onCreate || mode !== "idle") return;
        setTextInput("");
        setMode("creating");
    }
    useImperativeHandle(ref, () => ({ startCreating }));

    function startEditing(fieldId: string, item: T) {
        setEditing({ key: keyExtractor(item), field: fieldId });
        setMode("renaming");
    }

    function stopEditing() {
        setEditing(null);
        setMode("idle");
    }

    function commitEdit(newValue: string) {
        const field = editableFields?.find(f => f.id === editing?.field);
        const item = items.find(i => keyExtractor(i) === editing?.key);
        const trimmed = newValue.trim();
        if (field && item && trimmed.length > 0) field.onCommit(item, trimmed);
        stopEditing();
    }

    // lists with nothing to offer (the copy picker) get no ⋮ button
    const menuAvailable =
        !!onDelete || (extraActions?.length ?? 0) > 0 || (editableFields?.some(f => f.label) ?? false);

    function openMenu(item: T, x: number, y: number) {
        if (mode !== "idle") return;
        setMenu({ key: keyExtractor(item), x, y });
    }

    function menuEntries(item: T): MenuEntry[] {
        const entries: MenuEntry[] = [];
        for (const field of editableFields ?? []) {
            if (field.label) entries.push({ label: field.label, onSelect: () => startEditing(field.id, item) });
        }
        for (const action of extraActions ?? []) {
            if (action.visible && !action.visible(item)) continue;
            entries.push({
                label: typeof action.label === "function" ? action.label(item) : action.label,
                onSelect: () => action.onSelect(item),
            });
        }
        if (onDelete) entries.push({ label: deleteLabel, danger: true, onSelect: () => onDelete(item) });
        return entries;
    }

    const menuItem = menu ? items.find(i => keyExtractor(i) === menu.key) : undefined;

    return(
        <div className={`${className} cursor_list_wrapper ${handlesVisible ? "drag_mode" : ""} ${draggingKey !== null ? "is_dragging" : ""}`}>
            {onCreate && (
                <div style={{ visibility: mode === "creating" ? "visible" : "hidden" }} className="new_label">
                    New name:
                    <input
                        className="new_label_input app_input"
                        ref={inputRef}
                        type="text"
                        tabIndex={-1}
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();   // typing here must not trigger the window shortcuts
                            if (e.key === "Enter") {
                                const trimmed = textInput.trim();
                                if (trimmed.length > 0) onCreate(trimmed);
                                setMode("idle");
                            } else if (e.key === "Escape") {
                                setMode("idle");
                            }
                        }}
                        // clicking elsewhere abandons the creation (but alt-tabbing away doesn't)
                        onBlur={() => { if (mode === "creating" && document.hasFocus()) setMode("idle"); }}
                    />
                </div>
            )}

            <div className="cursor_list_scroll">
                <div className="cursor_list_inner">
                    <div className="cursor_list">
                        {items.map((item, index) => {
                            const key = keyExtractor(item);
                            return (
                                <div
                                    className={`cursor_row ${menu?.key === key ? "menu_open" : ""} ${draggingKey === key ? "row_dragging" : ""}`}
                                    ref={(el) => { rowRefs.current[index] = el; }}
                                    key={key}
                                    onMouseDown={(e) => startDrag(e, index)}
                                    onClick={() => {
                                        if (suppressClickRef.current) return;
                                        if (mode !== "idle") return;
                                        onActivate?.(item);
                                    }}
                                    onContextMenu={(e) => {
                                        // while renaming, let the normal menu (paste...) through
                                        if (!menuAvailable || mode !== "idle") return;
                                        e.preventDefault();
                                        openMenu(item, e.clientX, e.clientY);
                                    }}>
                                    <div className="cursor_row_content">
                                        {renderItem(item, {
                                            field: mode === "renaming" && editing?.key === key ? editing.field : null,
                                            commit: commitEdit,
                                            cancel: stopEditing,
                                        })}
                                    </div>

                                    {/* same slot as the ⋮ button, drawn over it (absolute): moves nothing */}
                                    {handlesVisible && <span className="drag_handle" aria-hidden="true">⠿</span>}

                                    {menuAvailable && (
                                        <button
                                            type="button"
                                            className={`item_menu_button ${handlesVisible ? "item_menu_button_hidden" : ""}`}
                                            tabIndex={-1}
                                            aria-label="More options"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={(e) => {
                                                e.stopPropagation();   // don't also open the row
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                openMenu(item, rect.left, rect.bottom + 4);
                                            }}
                                        >
                                            <EllipsisVertical strokeWidth={3}/>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                {menu && menuItem && (
                    <ContextMenu
                        x={menu.x}
                        y={menu.y}
                        entries={menuEntries(menuItem)}
                        onClose={() => setMenu(null)}
                    />
                )}
            </div>
        </div>
    )
}

export { CursorList };
export type { ItemEditor, EditableField, CursorListHandle, ExtraAction };