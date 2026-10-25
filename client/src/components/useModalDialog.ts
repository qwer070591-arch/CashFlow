import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useModalDialog(dialogRef: RefObject<HTMLDialogElement | null>, initialFocusRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    function keepTabInside(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    }
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    dialog?.addEventListener('keydown', keepTabInside);
    initialFocusRef?.current?.focus();

    return () => {
      dialog?.close();
      dialog?.removeEventListener('keydown', keepTabInside);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [dialogRef, initialFocusRef]);
}
