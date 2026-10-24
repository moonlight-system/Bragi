import { useRef } from "react";
import { EllipsisVertical } from "lucide-react";

function PressableRow({ className, onTap, onMenu, children }: {
  className: string;
  onTap: () => void;
  onMenu: () => void;
  children: React.ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  function cancel() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return (
    <div
      className={`${className} m_row`}
      onPointerDown={(e) => {
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = window.setTimeout(() => { fired.current = true; onMenu(); }, 500);
      }}
      // moving the finger means the user is scrolling, not pressing
      onPointerMove={(e) => {
        if (Math.abs(e.clientX - origin.current.x) > 10 || Math.abs(e.clientY - origin.current.y) > 10) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      // the tap that ends a long-press must not also count as a normal tap
      onClick={() => { if (!fired.current) onTap(); }}
    >
      {children}
      <button
        className="m_kebab"
        aria-label="Options"
        onPointerDown={(e) => e.stopPropagation()}   // don't start the long-press timer
        onClick={(e) => { e.stopPropagation(); onMenu(); }}
      >
        <EllipsisVertical size={22} />
      </button>
    </div>
  );
}

export { PressableRow };