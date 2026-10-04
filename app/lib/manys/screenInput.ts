/** Map a click on the displayed screen back to the computer's viewport. */
export function pagePoint(
  frame: { width: number; height: number },
  box: { left: number; top: number; width: number; height: number },
  point: { clientX: number; clientY: number },
): { x: number; y: number } | null {
  if (frame.width <= 0 || frame.height <= 0 || box.width <= 0 || box.height <= 0) return null;
  const x = ((point.clientX - box.left) / box.width) * frame.width;
  const y = ((point.clientY - box.top) / box.height) * frame.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.min(Math.max(Math.round(x), 0), Math.round(frame.width) - 1),
    y: Math.min(Math.max(Math.round(y), 0), Math.round(frame.height) - 1),
  };
}

export function modifierBits(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): number {
  return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
}

export function isPasteShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.key.toLowerCase() === 'v' && (event.metaKey || event.ctrlKey);
}

export function mouseMessage(
  kind: 'pressed' | 'released' | 'moved',
  point: { x: number; y: number },
  event: { button: number; detail: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
): Record<string, unknown> {
  const button = event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left';
  return {
    type: 'mouse',
    event: kind,
    ...point,
    button,
    clickCount: kind === 'moved' ? 0 : Math.max(1, event.detail || 0),
    modifiers: modifierBits(event),
  };
}

export function keyMessage(
  phase: 'down' | 'up',
  event: { key: string; code: string; keyCode: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
): Record<string, unknown> {
  return {
    type: 'key',
    event: phase,
    key: event.key,
    code: event.code,
    windowsVirtualKeyCode: event.keyCode,
    ...(phase === 'down' && event.key.length === 1 ? { text: event.key } : {}),
    modifiers: modifierBits(event),
  };
}

export function wheelMessage(
  point: { x: number; y: number },
  event: { deltaX: number; deltaY: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
): Record<string, unknown> {
  return {
    type: 'wheel',
    ...point,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    modifiers: modifierBits(event),
  };
}
