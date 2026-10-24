import { useEffect, useRef, useState } from "react";

export type MobileScreen = "playlists" | "songs" | "player" | "settings";

export function useMobileNav() {
  const [stack, setStack] = useState<MobileScreen[]>(["playlists"]);
  const [modalOpen, setModalOpenState] = useState(false);
  // mirror of modalOpen that is always current, even between two renders
  const modalOpenRef = useRef(false);

  function setModalOpen(open: boolean) {
    modalOpenRef.current = open;
    setModalOpenState(open);
  }

  useEffect(() => {
    // tag the entry we start on, so coming back to it restores the right state
    history.replaceState({ stack: ["playlists"], modal: false }, "");

    function onPopState(event: PopStateEvent) {
      setStack(event.state?.stack ?? ["playlists"]);
      setModalOpen(!!event.state?.modal);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function push(screen: MobileScreen) {
    const next = [...stack, screen];
    history.pushState({ stack: next, modal: false }, "");
    setStack(next);
    setModalOpen(false);
  }

  function back() {
    // with a dialog open, this pops the dialog's entry first
    if (modalOpenRef.current || stack.length > 1) history.back();
  }

  // a dialog gets its own history entry (same screen stack, modal flag on)
  function openModal() {
    if (modalOpenRef.current) return;   // already open: reuse its entry
    history.pushState({ stack, modal: true }, "");
    setModalOpen(true);
  }

  function closeModal() {
    if (modalOpenRef.current) history.back();   // popstate then clears the flag
  }

  return { screen: stack[stack.length - 1], stack, push, back, modalOpen, openModal, closeModal };
}