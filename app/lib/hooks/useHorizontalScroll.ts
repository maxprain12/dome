import { useEffect, type RefObject } from 'react';

const DRAG_THRESHOLD = 10;

function hasHorizontalOverflow(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth + 1;
}

/**
 * Walk up from `target` to (but not including) `container` looking for the
 * nearest ancestor that can scroll vertically. Used so a Kanban column's card
 * list keeps its vertical wheel scroll — the parent only translates to
 * horizontal when the column is already at its top/bottom boundary.
 */
function findVerticalScrollableAncestor(target: Element | null, container: HTMLElement): HTMLElement | null {
  let node = target instanceof Element ? target.parentElement : null;
  while (node && node !== container) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
    if (canScrollY) return node;
    node = node.parentElement;
  }
  return null;
}

/** True when `el` cannot scroll further in the direction implied by `deltaY`. */
function isAtVerticalBoundary(el: HTMLElement, deltaY: number): boolean {
  if (deltaY > 0) return el.scrollTop + el.clientHeight >= el.scrollHeight - 1; // at bottom
  if (deltaY < 0) return el.scrollTop <= 0; // at top
  return false;
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

      // If the wheel started inside a vertically-scrollable child (e.g. a
      // Kanban column's card list) and that child can still scroll in the
      // wheel direction, let the browser handle the vertical scroll and don't
      // translate to horizontal — otherwise we'd steal column scrolling.
      const verticalChild = findVerticalScrollableAncestor(event.target as Element | null, element);
      if (verticalChild && !isAtVerticalBoundary(verticalChild, event.deltaY)) return;

      const horizontalDelta = event.deltaX;
      const verticalDelta = event.deltaY;
      const shouldTranslateVerticalWheel = Math.abs(verticalDelta) > Math.abs(horizontalDelta);
      const delta = shouldTranslateVerticalWheel ? verticalDelta : horizontalDelta;

      if (delta === 0) return;

      // Don't steal the event (and prevent default scroll chaining) if the
      // container is already at its horizontal boundary in this direction.
      const atStart = element.scrollLeft <= 0;
      const atEnd = element.scrollLeft >= element.scrollWidth - element.clientWidth - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

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
