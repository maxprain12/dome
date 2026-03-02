// Copyright (c) 2025 Dome contributors. MIT License.
import type { Editor } from "@tiptap/core";
import type { HoveringCellInfo } from "../utils";
import { computePosition, offset } from "@floating-ui/dom";

export class DragHandleController {
  private _colDragHandle: HTMLElement;
  private _rowDragHandle: HTMLElement;

  constructor() {
    this._colDragHandle = this._createHandle("col");
    this._rowDragHandle = this._createHandle("row");
  }

  get colDragHandle(): HTMLElement {
    return this._colDragHandle;
  }

  get rowDragHandle(): HTMLElement {
    return this._rowDragHandle;
  }

  show(editor: Editor, hoveringCell: HoveringCellInfo): void {
    this._showColHandle(editor, hoveringCell);
    this._showRowHandle(editor, hoveringCell);
  }

  hide(): void {
    for (const handle of [this._colDragHandle, this._rowDragHandle]) {
      Object.assign(handle.style, { display: "none", left: "-999px", top: "-999px" });
    }
  }

  destroy(): void {
    this._colDragHandle.remove();
    this._rowDragHandle.remove();
  }

  private _createHandle(type: "col" | "row"): HTMLElement {
    const el = document.createElement("div");
    el.classList.add("drag-handle");
    el.setAttribute("draggable", "true");
    el.setAttribute("data-direction", type === "col" ? "horizontal" : "vertical");
    el.setAttribute("data-drag-handle", "");
    Object.assign(el.style, {
      position: "absolute",
      top: "-999px",
      left: "-999px",
      display: "none",
    });
    return el;
  }

  private _showColHandle(editor: Editor, hoveringCell: HoveringCellInfo): void {
    const ref = editor.view.nodeDOM(hoveringCell.colFirstCellPos);
    if (!ref) return;

    const yOffset =
      -1 * parseInt(getComputedStyle(this._colDragHandle).height) / 2;

    computePosition(ref as HTMLElement, this._colDragHandle, {
      placement: "top",
      middleware: [offset(yOffset)],
    }).then(({ x, y }) => {
      Object.assign(this._colDragHandle.style, {
        display: "block",
        top: `${y}px`,
        left: `${x}px`,
      });
    });
  }

  private _showRowHandle(editor: Editor, hoveringCell: HoveringCellInfo): void {
    const ref = editor.view.nodeDOM(hoveringCell.rowFirstCellPos);
    if (!ref) return;

    const xOffset =
      -1 * parseInt(getComputedStyle(this._rowDragHandle).width) / 2;

    computePosition(ref as HTMLElement, this._rowDragHandle, {
      placement: "left",
      middleware: [offset(xOffset)],
    }).then(({ x, y }) => {
      Object.assign(this._rowDragHandle.style, {
        display: "block",
        top: `${y}px`,
        left: `${x}px`,
      });
    });
  }
}
