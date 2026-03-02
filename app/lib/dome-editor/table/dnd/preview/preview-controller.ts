// Copyright (c) 2025 Dome contributors. MIT License.
import { computePosition, offset } from "@floating-ui/dom";
import type { ReferenceElement } from "@floating-ui/dom";
import type { DraggingDOMs } from "../utils";
import { clearPreviewDOM, createPreviewDOM } from "./render-preview";

export class PreviewController {
  private _preview: HTMLElement;

  constructor() {
    this._preview = document.createElement("div");
    this._preview.classList.add("table-dnd-preview", "ProseMirror");
    Object.assign(this._preview.style, {
      position: "absolute",
      pointerEvents: "none",
      display: "none",
    });
  }

  get previewRoot(): HTMLElement {
    return this._preview;
  }

  onDragStart(
    relatedDoms: DraggingDOMs,
    index: number | undefined,
    type: "col" | "row",
  ): void {
    this._initStyle(relatedDoms.table, relatedDoms.cell, type);
    createPreviewDOM(relatedDoms.table, this._preview, index, type);
    this._initPosition(relatedDoms.cell, type);
  }

  onDragEnd(): void {
    clearPreviewDOM(this._preview);
    Object.assign(this._preview.style, { display: "none" });
  }

  onDragging(
    relatedDoms: DraggingDOMs,
    x: number,
    y: number,
    type: "col" | "row",
  ): void {
    this._updatePosition(x, y, relatedDoms.cell, type);
  }

  destroy(): void {
    this._preview.remove();
  }

  private _initStyle(
    table: HTMLTableElement,
    cell: HTMLTableCellElement,
    type: "col" | "row",
  ): void {
    const tableRect = table.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();

    if (type === "col") {
      Object.assign(this._preview.style, {
        display: "block",
        width: `${cellRect.width}px`,
        height: `${tableRect.height}px`,
      });
    } else {
      Object.assign(this._preview.style, {
        display: "block",
        width: `${tableRect.width}px`,
        height: `${cellRect.height}px`,
      });
    }
  }

  private _initPosition(cell: HTMLElement, type: "col" | "row"): void {
    void computePosition(cell, this._preview, {
      placement: type === "row" ? "right" : "bottom",
      middleware: [
        offset(({ rects }) =>
          type === "col" ? -rects.reference.height : -rects.reference.width,
        ),
      ],
    }).then(({ x, y }) => {
      Object.assign(this._preview.style, { left: `${x}px`, top: `${y}px` });
    });
  }

  private _updatePosition(
    x: number,
    y: number,
    cell: HTMLElement,
    type: "col" | "row",
  ): void {
    computePosition(virtualElement(cell, x, y), this._preview, {
      placement: type === "row" ? "right" : "bottom",
    }).then(({ x: px, y: py }) => {
      if (type === "row") {
        Object.assign(this._preview.style, { top: `${py}px` });
      } else {
        Object.assign(this._preview.style, { left: `${px}px` });
      }
    });
  }
}

function virtualElement(
  cell: HTMLElement,
  x: number,
  y: number,
): ReferenceElement {
  return {
    contextElement: cell,
    getBoundingClientRect: () => {
      const rect = cell.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        right: x + rect.width / 2,
        bottom: y + rect.height / 2,
        top: y - rect.height / 2,
        left: x - rect.width / 2,
        x: x - rect.width / 2,
        y: y - rect.height / 2,
      };
    },
  };
}
