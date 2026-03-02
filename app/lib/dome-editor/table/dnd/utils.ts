// Copyright (c) 2025 Dome contributors. MIT License.
import { cellAround, TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

export interface HoveringCellInfo {
  rowIndex: number;
  colIndex: number;
  cellPos: number;
  rowFirstCellPos: number;
  colFirstCellPos: number;
}

export type DraggingDOMs = {
  table: HTMLTableElement;
  cell: HTMLTableCellElement;
};

export function getHoveringCell(
  view: EditorView,
  event: MouseEvent,
): HoveringCellInfo | undefined {
  const domCell = domCellAround(event.target as HTMLElement | null);
  if (!domCell) return;

  const { left, top, width, height } = domCell.getBoundingClientRect();
  const eventPos = view.posAtCoords({
    left: left + width / 2,
    top: top + height / 2,
  });
  if (!eventPos) return;

  const $cellPos = cellAround(view.state.doc.resolve(eventPos.pos));
  if (!$cellPos) return;

  const map = TableMap.get($cellPos.node(-1));
  const tableStart = $cellPos.start(-1);
  const cellRect = map.findCell($cellPos.pos - tableStart);

  return {
    rowIndex: cellRect.top,
    colIndex: cellRect.left,
    cellPos: $cellPos.pos,
    rowFirstCellPos: getCellPos(map, tableStart, cellRect.top, 0),
    colFirstCellPos: getCellPos(map, tableStart, 0, cellRect.left),
  };
}

function domCellAround(target: HTMLElement | null): HTMLElement | null {
  while (target && target.nodeName !== "TD" && target.nodeName !== "TH") {
    target = target.classList?.contains("ProseMirror")
      ? null
      : (target.parentNode as HTMLElement | null);
  }
  return target;
}

function getCellPos(
  map: TableMap,
  tableStart: number,
  rowIndex: number,
  colIndex: number,
): number {
  const cellIndex = map.width * rowIndex + colIndex;
  const posInTable = map.map[cellIndex];
  return tableStart + posInTable;
}

function getTableDOMByPos(
  view: EditorView,
  pos: number,
): HTMLTableElement | undefined {
  const dom = view.domAtPos(pos).node;
  if (!dom) return;
  const element = dom instanceof HTMLElement ? dom : dom.parentElement;
  return element?.closest("table") ?? undefined;
}

function getTargetFirstCellDOM(
  table: HTMLTableElement,
  index: number,
  direction: "row" | "col",
): HTMLTableCellElement | undefined {
  if (direction === "row") {
    const row = table.querySelectorAll("tr")[index];
    return row?.querySelector<HTMLTableCellElement>("th,td") ?? undefined;
  }
  const row = table.querySelector("tr");
  return row?.querySelectorAll<HTMLTableCellElement>("th,td")[index] ?? undefined;
}

export function getDndRelatedDOMs(
  view: EditorView,
  cellPos: number | undefined,
  draggingIndex: number,
  direction: "row" | "col",
): DraggingDOMs | undefined {
  if (cellPos == null) return;
  const table = getTableDOMByPos(view, cellPos);
  if (!table) return;
  const cell = getTargetFirstCellDOM(table, draggingIndex, direction);
  if (!cell) return;
  return { table, cell };
}
