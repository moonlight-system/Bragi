import { Playlist } from "../types_and_functions";
import { EditableLabel } from "./EditableLabel";
import type { ItemEditor } from "./CursorList";
import "./Playlist_List_Item.css";

function PlaylistListItem({ playlist, selected, editor }: {
    playlist: Playlist;
    selected: boolean;
    editor?: ItemEditor;   // optional: the copy picker doesn't pass one
}) {
    return (
        <div
            className="playlist_list_item"
            style={{ color: selected ? "var(--playlist-accent-color)" : "var(--text-color)" }}
        >
            <EditableLabel value={playlist.name} field="name" editor={editor} />
        </div>
    );
}

export { PlaylistListItem };