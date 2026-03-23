import { useEffect, type RefObject } from 'react';

const DRAG_THRESHOLD = 10;

function hasHorizontalOverflow(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth + 1;
}

export function useHorizontalScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let pointerId: number | null = null;
    let pointerDown = false;
    let dragging = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let resetSuppressClickTimer: number | null = null;

    const clearSuppressClickTimer = () => {
      if (resetSuppressClickTimer !== null) {
        window.clearTimeout(resetSuppressClickTimer);
        resetSuppressClickTimer = null;
      }
    };

    const updateCursor = () => {
      element.style.cursor = hasHorizontalOverflow(element)
        ? (dragging ? 'grabbing' : 'grab')
        : '';
    };

    const scheduleSuppressClickReset = () => {
      clearSuppressClickTimer();
      resetSuppressClickTimer = window.setTimeout(() => {
        suppressClick = false;
        resetSuppressClickTimer = null;
      }, 0);
    };

    const endPointerInteraction = (event?: PointerEvent) => {
      if (event && pointerId !== null && event.pointerId !== pointerId) return;

      const hadDragged = dragging;
      const capturedPointerId = pointerId;

      pointerId = null;
      pointerDown = false;
      dragging = false;
      element.style.userSelect = '';

      if (capturedPointerId !== null && element.hasPointerCapture?.(capturedPointerId)) {
        try {
          element.releasePointerCapture(capturedPointerId);
        } catch {
          // Pointer capture can already be gone if the browser released it.
        }
      }

      updateCursor();

      if (hadDragged) {
        scheduleSuppressClickReset();
      } else {
        suppressClick = false;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!hasHorizontalOverflow(element)) return;

      const horizontalDelta = event.deltaX;
      const verticalDelta = event.deltaY;
      const shouldTranslateVerticalWheel = Math.abs(verticalDelta) > Math.abs(horizontalDelta);
      const delta = shouldTranslateVerticalWheel ? verticalDelta : horizontalDelta;

      if (delta === 0) return;

      element.scrollLeft += delta;
      event.preventDefault();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !hasHorizontalOverflow(element)) return;

      clearSuppressClickTimer();
      pointerId = event.pointerId;
      pointerDown = true;
      dragging = false;
      suppressClick = false;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = element.scrollLeft;
      updateCursor();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerDown || event.pointerId !== pointerId) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (!dragging) {
        if (absDeltaX < DRAG_THRESHOLD) return;
        if (absDeltaX <= absDeltaY) return;

        element.setPointerCapture?.(event.pointerId);
      }

      dragging = true;
      suppressClick = true;
      element.style.userSelect = 'none';
      element.scrollLeft = startScrollLeft - deltaX;
      updateCursor();
      event.preventDefault();
    };

    const handlePointerUp = (event: PointerEvent) => {
      endPointerInteraction(event);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      suppressClick = false;
      endPointerInteraction(event);
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return;

      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
      clearSuppressClickTimer();
    };

    const handleDragStart = (event: DragEvent) => {
      if (!pointerDown) return;
      event.preventDefault();
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateCursor())
      : null;

    resizeObserver?.observe(element);
    updateCursor();

    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', handlePointerUp);
    element.addEventListener('pointercancel', handlePointerCancel);
    element.addEventListener('click', handleClickCapture, true);
    element.addEventListener('dragstart', handleDragStart);
    window.addEventListener('resize', updateCursor);

    return () => {
      clearSuppressClickTimer();
      resizeObserver?.disconnect();
      element.style.cursor = '';
      element.style.userSelect = '';
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('pointercancel', handlePointerCancel);
      element.removeEventListener('click', handleClickCapture, true);
      element.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('resize', updateCursor);
    };
  }, [ref]);
}
