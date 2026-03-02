// Copyright (c) 2025 Dome contributors. MIT License.
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { PluginSpec } from "@tiptap/pm/state";
import type { EditorProps } from "@tiptap/pm/view";
import type { DraggingDOMs, HoveringCellInfo } from "./utils";
import { getDndRelatedDOMs, getHoveringCell } from "./utils";
import { getDragOverColumn, getDragOverRow } from "./calc-drag-over";
import { moveColumn, moveRow } from "../utils";
import { PreviewController } from "./preview/preview-controller";
import { DropIndicatorController } from "./preview/drop-indicator-controller";
import { DragHandleController } from "./handle/drag-handle-controller";
import { EmptyImageController } from "./handle/empty-image-controller";
import { AutoScrollController } from "./auto-scroll-controller";

export const TableDndKey = new PluginKey("table-drag-and-drop");

class TableDndPluginSpec implements PluginSpec<void> {
  key = TableDndKey;
  props: EditorProps<Plugin<void>>;

  private _colDragHandle: HTMLElement;
  private _rowDragHandle: HTMLElement;
  private _hoveringCell?: HoveringCellInfo;
  private _disposables: Array<() => void> = [];
  private _draggingCoords: { x: number; y: number } = { x: 0, y: 0 };
  private _dragging = false;
  private _draggingDirection: "col" | "row" = "col";
  private _draggingIndex = -1;
  private _droppingIndex = -1;
  private _draggingDOMs?: DraggingDOMs;
  private _startCoords: { x: number; y: number } = { x: 0, y: 0 };
  private _previewController: PreviewController;
  private _dropIndicatorController: DropIndicatorController;
  private _dragHandleController: DragHandleController;
  private _emptyImageController: EmptyImageController;
  private _autoScrollController: AutoScrollController;

  constructor(public editor: Editor) {
    this.props = {
      handleDOMEvents: {
        pointerover: this._pointerOver,
      },
    };

    this._dragHandleController = new DragHandleController();
    this._colDragHandle = this._dragHandleController.colDragHandle;
    this._rowDragHandle = this._dragHandleController.rowDragHandle;
    this._previewController = new PreviewController();
    this._dropIndicatorController = new DropIndicatorController();
    this._emptyImageController = new EmptyImageController();
    this._autoScrollController = new AutoScrollController();

    this._bindDragEvents();
  }

  view = () => {
    const wrapper = this.editor.options.element;
    // @ts-ignore
    wrapper.appendChild(this._colDragHandle);
    // @ts-ignore
    wrapper.appendChild(this._rowDragHandle);
    // @ts-ignore
    wrapper.appendChild(this._previewController.previewRoot);
    // @ts-ignore
    wrapper.appendChild(this._dropIndicatorController.dropIndicatorRoot);

    return { update: this.update, destroy: this.destroy };
  };

  update = () => {};

  destroy = () => {
    if (!this.editor.isDestroyed) return;
    this._dragHandleController.destroy();
    this._emptyImageController.destroy();
    this._previewController.destroy();
    this._dropIndicatorController.destroy();
    this._autoScrollController.stop();
    this._disposables.forEach((fn) => fn());
  };

  private _pointerOver = (view: import("@tiptap/pm/view").EditorView, event: PointerEvent) => {
    if (this._dragging) return;

    if (!this.editor.isEditable) {
      this._dragHandleController.hide();
      return;
    }

    const hoveringCell = getHoveringCell(view, event);
    this._hoveringCell = hoveringCell;
    if (!hoveringCell) {
      this._dragHandleController.hide();
    } else {
      this._dragHandleController.show(this.editor, hoveringCell);
    }
  };

  private _onDragColStart = (event: DragEvent) => this._onDragStart(event, "col");
  private _onDragRowStart = (event: DragEvent) => this._onDragStart(event, "row");

  private _onDraggingCol = (event: DragEvent) => {
    const doms = this._draggingDOMs;
    if (!doms) return;

    this._draggingCoords = { x: event.clientX, y: event.clientY };
    this._previewController.onDragging(doms, event.clientX, event.clientY, "col");
    this._autoScrollController.checkXAutoScroll(event.clientX, doms);

    const direction = this._startCoords.x > event.clientX ? "left" : "right";
    const dragOverColumn = getDragOverColumn(doms.table, event.clientX);
    if (!dragOverColumn) return;

    const [col, index] = dragOverColumn;
    this._droppingIndex = index;
    this._dropIndicatorController.onDragging(col, direction, "col");
  };

  private _onDraggingRow = (event: DragEvent) => {
    const doms = this._draggingDOMs;
    if (!doms) return;

    this._draggingCoords = { x: event.clientX, y: event.clientY };
    this._previewController.onDragging(doms, event.clientX, event.clientY, "row");
    this._autoScrollController.checkYAutoScroll(event.clientY);

    const direction = this._startCoords.y > event.clientY ? "up" : "down";
    const dragOverRow = getDragOverRow(doms.table, event.clientY);
    if (!dragOverRow) return;

    const [row, index] = dragOverRow;
    this._droppingIndex = index;
    this._dropIndicatorController.onDragging(row, direction, "row");
  };

  private _onDragEnd = () => {
    this._dragging = false;
    this._draggingIndex = -1;
    this._droppingIndex = -1;
    this._startCoords = { x: 0, y: 0 };
    this._autoScrollController.stop();
    this._dropIndicatorController.onDragEnd();
    this._previewController.onDragEnd();
  };

  private _onDragStart = (event: DragEvent, type: "col" | "row") => {
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) {
      dataTransfer.effectAllowed = "move";
      this._emptyImageController.hideDragImage(dataTransfer);
    }

    this._dragging = true;
    this._draggingDirection = type;
    this._startCoords = { x: event.clientX, y: event.clientY };

    const draggingIndex =
      (type === "col"
        ? this._hoveringCell?.colIndex
        : this._hoveringCell?.rowIndex) ?? 0;
    this._draggingIndex = draggingIndex;

    const relatedDoms = getDndRelatedDOMs(
      this.editor.view,
      this._hoveringCell?.cellPos,
      draggingIndex,
      type,
    );
    this._draggingDOMs = relatedDoms;

    const index =
      type === "col"
        ? this._hoveringCell?.colIndex
        : this._hoveringCell?.rowIndex;

    if (relatedDoms) {
      this._previewController.onDragStart(relatedDoms, index, type);
      this._dropIndicatorController.onDragStart(relatedDoms, type);
    }
  };

  private _onDrag = (event: DragEvent) => {
    event.preventDefault();
    if (!this._dragging) return;
    if (this._draggingDirection === "col") {
      this._onDraggingCol(event);
    } else {
      this._onDraggingRow(event);
    }
  };

  private _onDrop = () => {
    if (!this._dragging) return;
    const from = this._draggingIndex;
    const to = this._droppingIndex;
    const tr = this.editor.state.tr;
    const pos = this.editor.state.selection.from;

    if (this._draggingDirection === "col") {
      const ok = moveColumn({ tr, originIndex: from, targetIndex: to, select: true, pos });
      if (ok) this.editor.view.dispatch(tr);
    } else {
      const ok = moveRow({ tr, originIndex: from, targetIndex: to, select: true, pos });
      if (ok) this.editor.view.dispatch(tr);
    }
  };

  private _bindDragEvents = () => {
    this._colDragHandle.addEventListener("dragstart", this._onDragColStart);
    this._disposables.push(() =>
      this._colDragHandle.removeEventListener("dragstart", this._onDragColStart),
    );

    this._colDragHandle.addEventListener("dragend", this._onDragEnd);
    this._disposables.push(() =>
      this._colDragHandle.removeEventListener("dragend", this._onDragEnd),
    );

    this._rowDragHandle.addEventListener("dragstart", this._onDragRowStart);
    this._disposables.push(() =>
      this._rowDragHandle.removeEventListener("dragstart", this._onDragRowStart),
    );

    this._rowDragHandle.addEventListener("dragend", this._onDragEnd);
    this._disposables.push(() =>
      this._rowDragHandle.removeEventListener("dragend", this._onDragEnd),
    );

    const ownerDocument = this.editor.view.dom?.ownerDocument;
    if (ownerDocument) {
      ownerDocument.addEventListener("drop", this._onDrop);
      ownerDocument.addEventListener("dragover", this._onDrag);
      this._disposables.push(() => {
        ownerDocument.removeEventListener("drop", this._onDrop);
        ownerDocument.removeEventListener("dragover", this._onDrag);
      });
    }
  };
}

export const TableDndExtension = Extension.create({
  name: "table-drag-and-drop",

  addProseMirrorPlugins() {
    const spec = new TableDndPluginSpec(this.editor);
    return [new Plugin(spec)];
  },
});
