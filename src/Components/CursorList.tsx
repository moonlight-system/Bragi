import "./CursorList.css";
import { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { EllipsisVertical } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import type { MenuEntry } from "./ContextMenu";

// one text field of an item that can be edited in place
interface EditableField<T> {
    id: string;                                 // e.g. "name" or "artist"
    key: string;                                // key that starts editing it, e.g. "r"
    label?: string;                             // shown in the ⋮ menu, e.g. "Rename song"
    onCommit: (item: T, newValue: string) => void;
}

// handed to renderItem so an item can show an input instead of its label
type ItemEditor = {
    field: string | null;                       // field being edited on this item (null = none)
    commit: (newValue: string) => void;
    cancel: () => void;
};

// lets a parent start "create" mode (the + button) without the keyboard
type CursorListHandle = {
    startCreating: () => void;
};

// an extra entry for the ⋮ / right-click menu, on top of rename and delete
type ExtraAction<T> = {
    label: string;
    onSelect: (item: T) => void;
};

interface CursorListProps<T>{
    className?: string;
    items: T[];
    keyExtractor: (item: T) => string;
    renderItem: (item: T, isSelected: boolean, editor: ItemEditor) => React.ReactNode;
    selectedIndex: number;
    onSelectedIndexChange: (index: number) => void;
    onActivate?: (item: T) => void;
    onCreate?: (name: string) => void;
    onDelete?: (item: T) => void;
    editableFields?: EditableField<T>[];
    onReorder?: (item: T, direction: "up" | "down") => void;
    onModeChange?: (mode: "idle" | "creating" | "renaming") => void;
    enabled?: boolean;
    deleteLabel?: string;
    extraActions?: ExtraAction<T>[];
    ref?: React.Ref<CursorListHandle>;
}

function CursorList<T>({
    className,
    items,
    keyExtractor,
    renderItem,
    selectedIndex,
    onSelectedIndexChange,
    onActivate,
    onCreate,
    onDelete,
    editableFields,
    onReorder,
    onModeChange,
    enabled = true,
    deleteLabel = "Delete",
    extraActions,
    ref,
}: CursorListProps<T>){
    const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [cursorTop, setCursorTop] = useState(0);
    const [mode, setMode] = useState<"idle" | "creating" | "renaming">("idle");
    const [editingField, setEditingField] = useState<string | null>(null);
    const [textInput, setTextInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);

    // --- drag to reorder ---
    const [shiftHeld, setShiftHeld] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragMode = shiftHeld && !!onReorder && mode === "idle";
    const handlesVisible = dragMode || isDragging;          // true = handles replace the ⋮ buttons
    const dragIndexRef = useRef<number | null>(null);       // row being dragged (follows the item as it swaps)
    const swapPendingRef = useRef(false);                   // a swap was requested but not rendered yet
    const suppressClickRef = useRef(false);                 // stops the click that ends a drag from activating the row

    // handlers registered on window must see the latest props, not the ones from when the drag started
    const latest = useRef({ items, onReorder, onSelectedIndexChange });
    latest.current = { items, onReorder, onSelectedIndexChange };

    // the list was re-rendered with the new order: the next swap may happen
    useEffect(() => {
        swapPendingRef.current = false;
    }, [items]);

    useEffect(() => {
        const selectedRow = rowRefs.current[selectedIndex];
        if (selectedRow) {
            setCursorTop(selectedRow.offsetTop);
        }
    }, [selectedIndex, items, mode]);

    useEffect(() => {
        if (mode === "creating") inputRef.current?.focus();
        onModeChange?.(mode);
    }, [mode]);

    useEffect(() => {
        const selectedRow = rowRefs.current[selectedIndex];
        if (selectedRow) {
            selectedRow.scrollIntoView({ block: "nearest" });
        }
    }, [selectedIndex, items]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (!enabled) return;
            if (menu) return;   // a menu is open: don't let x / n / r act behind it
            const editField = editableFields?.find(f => f.key === event.key);

            if (mode !== "idle") {
                if (mode === "creating") {
                    if (event.key === "Enter") {
                        const trimmed = textInput.trim();
                        if (trimmed.length > 0) onCreate?.(trimmed);
                        setMode("idle");
                    } else if (event.key === "Escape") {
                        setMode("idle");
                    }
                }
                return;
            }

            if (event.shiftKey && event.code === "ArrowUp" && onReorder && selectedIndex > 0) {
                event.preventDefault();
                onReorder(items[selectedIndex], "up");
                onSelectedIndexChange(selectedIndex - 1);
            } else if (event.shiftKey && event.code === "ArrowDown" && onReorder && selectedIndex < items.length - 1) {
                event.preventDefault();
                onReorder(items[selectedIndex], "down");
                onSelectedIndexChange(selectedIndex + 1);
            } else if (event.code === "ArrowUp" && items.length > 0) {
                onSelectedIndexChange(selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1);
            } else if (event.code === "ArrowDown" && items.length > 0) {
                onSelectedIndexChange(selectedIndex >= items.length - 1 ? 0 : selectedIndex + 1);
            } else if (event.key === "n" && onCreate) {
                event.preventDefault();
                setTextInput("");
                setMode("creating");
            } else if (editField && items.length > 0) {
                event.preventDefault();
                setEditingField(editField.id);
                setMode("renaming");
            } else if (event.key === "x" && onDelete && items.length > 0) {
                onDelete(items[selectedIndex]);
            } else if (event.key === "Enter" && onActivate && items.length > 0) {
                onActivate(items[selectedIndex]);
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [enabled, menu, mode, items, selectedIndex, textInput, onSelectedIndexChange, onActivate, editableFields, onDelete, onCreate, onReorder]);

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

    // Shift + press on a row, then move the mouse: the row swaps with its neighbours as you cross them
    function startDrag(e: React.MouseEvent, index: number) {
        if (e.button !== 0 || !dragMode || !onReorder || mode !== "idle") return;
        if ((e.target as HTMLElement).closest(".item_menu_button")) return;   // the ⋮ button is not a drag start
        e.preventDefault();   // no text selection while dragging

        dragIndexRef.current = index;
        onSelectedIndexChange(index);
        setIsDragging(true);
        let moved = false;
        document.body.style.cursor = "grabbing";

        function onMove(ev: MouseEvent) {
            const current = dragIndexRef.current;
            if (current === null || swapPendingRef.current) return;
            const { items: list, onReorder: reorder, onSelectedIndexChange: select } = latest.current;

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
            const next = goingDown ? current + 1 : current - 1;
            swapPendingRef.current = true;
            reorder?.(list[current], goingDown ? "down" : "up");
            select(next);
            dragIndexRef.current = next;
            moved = true;
        }

        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            dragIndexRef.current = null;
            setIsDragging(false);
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

    function startEditing(fieldId: string) {
        setEditingField(fieldId);
        setMode("renaming");
    }

    // lists with nothing to offer (settings categories, the copy picker) get no ⋮ button
    const menuAvailable =
        !!onDelete || (extraActions?.length ?? 0) > 0 || (editableFields?.some(f => f.label) ?? false);

    function openMenu(index: number, x: number, y: number) {
        if (mode !== "idle") return;
        onSelectedIndexChange(index);   // the rename/delete logic works on the selected row
        setMenu({ index, x, y });
    }

    function menuEntries(item: T): MenuEntry[] {
        const entries: MenuEntry[] = [];
        for (const field of editableFields ?? []) {
            if (field.label) entries.push({ label: field.label, onSelect: () => startEditing(field.id) });
        }
        for (const action of extraActions ?? []) {
            entries.push({ label: action.label, onSelect: () => action.onSelect(item) });
        }
        if (onDelete) entries.push({ label: deleteLabel, danger: true, onSelect: () => onDelete(item) });
        return entries;
    }

    const cursorOpacity = items.length === 0 ? '0%' : enabled ? '100%' : '35%';

    function stopEditing() {
        setEditingField(null);
        setMode("idle");
    }

    function commitEdit(newValue: string) {
        const field = editableFields?.find(f => f.id === editingField);
        const trimmed = newValue.trim();
        if (field && trimmed.length > 0 && items[selectedIndex]) {
            field.onCommit(items[selectedIndex], trimmed);
        }
        stopEditing();
    }

    return(
        <div className={`${className} cursor_list_wrapper ${handlesVisible ? "drag_mode" : ""} ${isDragging ? "is_dragging" : ""}`}>
            {onCreate && (<div style={{opacity: mode !== "idle" ? '100%' : '0%'}} className="new_label rendered_item">New name:
                <input
                className="new_label_input app_input"
                ref={inputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                />
            </div>)}

            <div className="cursor_list_scroll">
                <div className="cursor_list_inner">
                    <div
                        className="cursor"
                        style={{ transform: `translateY(${cursorTop}px)`, opacity: cursorOpacity }}
                    >{'>'}</div>

                    <div className="cursor_list">
                        {items.map((item, index) => (
                            <div
                            className={`rendered_item cursor_row ${menu?.index === index ? "menu_open" : ""}`}
                            ref={(el) => { rowRefs.current[index] = el; }}
                            key={keyExtractor(item)}
                            onMouseDown={(e) => startDrag(e, index)}
                            onClick={() => {
                                if (suppressClickRef.current) return;
                                if (mode !== "idle") return;
                                onSelectedIndexChange(index);
                                onActivate?.(item);
                            }}
                            onContextMenu={(e) => {
                                // while renaming, let the normal menu (paste...) through
                                if (!menuAvailable || mode !== "idle") return;
                                e.preventDefault();
                                openMenu(index, e.clientX, e.clientY);
                            }}>
                                <div className="cursor_row_content">
                                    {renderItem(item, index === selectedIndex, {
                                        field: mode === "renaming" && index === selectedIndex ? editingField : null,
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
                                            e.stopPropagation();   // don't also select/open the row
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            openMenu(index, rect.left, rect.bottom + 4);
                                        }}
                                    >
                                        <EllipsisVertical strokeWidth={3}/>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                {menu && items[menu.index] && (
                    <ContextMenu
                        x={menu.x}
                        y={menu.y}
                        entries={menuEntries(items[menu.index])}
                        onClose={() => setMenu(null)}
                    />
                )}
            </div>
        </div>
    )
}

export { CursorList };
export type { ItemEditor, EditableField, CursorListHandle };