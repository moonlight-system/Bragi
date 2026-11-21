import type { Playlist } from "../types_and_functions";
import { EditableLabel } from "./EditableLabel";
import { CoverBox } from "./Cover";
import type { ItemEditor } from "./CursorList";
import "./Playlist_List_Item.css";

function PlaylistListItem({ playlist, active, editor }: {
    playlist: Playlist;
    active: boolean;       // the playlist whose songs are shown
    editor?: ItemEditor;   // optional: the copy picker doesn't pass one
}) {
    const count = playlist.songIds.length;
    return (
        <div
            className="item_row"
            style={{ color: active ? "var(--playlist-accent-color)" : "var(--text-color)" }}
        >
            <CoverBox url={playlist.cover} className="cover_row" />
            <div className="item_text">
                <div><EditableLabel value={playlist.name} field="name" editor={editor} /></div>
                <div className="song_artist_name item_sub">{count} {count === 1 ? "song" : "songs"}</div>
            </div>
        </div>
    );
}

export { PlaylistListItem };