// Copyright (c) 2025 Dome contributors. MIT License.
import { computePosition, offset } from "@floating-ui/dom";
import type { DraggingDOMs } from "../utils";

const DROP_INDICATOR_WIDTH = 2;

export class DropIndicatorController {
  private _indicator: HTMLElement;

  constructor() {
    this._indicator = document.createElement("div");
    this._indicator.classList.add("table-dnd-drop-indicator");
    Object.assign(this._indicator.style, {
      position: "absolute",
      pointerEvents: "none",
    });
  }

  get dropIndicatorRoot(): HTMLElement {
    return this._indicator;
  }

  onDragStart(relatedDoms: DraggingDOMs, type: "col" | "row"): void {
    this._initStyle(relatedDoms.table, type);
    this._initPosition(relatedDoms.cell, type);
    this._indicator.dataset.dragging = "true";
  }

  onDragEnd(): void {
    Object.assign(this._indicator.style, { display: "none" });
    this._indicator.dataset.dragging = "false";
  }

  onDragging(
    target: Element,
    direction: "left" | "right" | "up" | "down",
    type: "col" | "row",
  ): void {
    if (type === "col") {
      void computePosition(target, this._indicator, {
        placement: direction === "left" ? "left" : "right",
        middleware: [offset(direction === "left" ? -DROP_INDICATOR_WIDTH : 0)],
      }).then(({ x }) => {
        Object.assign(this._indicator.style, { left: `${x}px` });
      });
    } else {
      void computePosition(target, this._indicator, {
        placement: direction === "up" ? "top" : "bottom",
        middleware: [offset(direction === "up" ? -DROP_INDICATOR_WIDTH : 0)],
      }).then(({ y }) => {
        Object.assign(this._indicator.style, { top: `${y}px` });
      });
    }
  }

  destroy(): void {
    this._indicator.remove();
  }

  private _initStyle(table: HTMLElement, type: "col" | "row"): void {
    const tableRect = table.getBoundingClientRect();
    if (type === "col") {
      Object.assign(this._indicator.style, {
        display: "block",
        width: `${DROP_INDICATOR_WIDTH}px`,
        height: `${tableRect.height}px`,
      });
    } else {
      Object.assign(this._indicator.style, {
        display: "block",
        width: `${tableRect.width}px`,
        height: `${DROP_INDICATOR_WIDTH}px`,
      });
    }
  }

  private _initPosition(cell: HTMLElement, type: "col" | "row"): void {
    void computePosition(cell, this._indicator, {
      placement: type === "row" ? "right" : "bottom",
      middleware: [
        offset(({ rects }) =>
          type === "col" ? -rects.reference.height : -rects.reference.width,
        ),
      ],
    }).then(({ x, y }) => {
      Object.assign(this._indicator.style, { left: `${x}px`, top: `${y}px` });
    });
  }
}
