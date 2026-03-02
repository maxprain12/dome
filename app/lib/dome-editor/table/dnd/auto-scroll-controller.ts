// Copyright (c) 2025 Dome contributors. MIT License.
import type { DraggingDOMs } from "./utils";

const EDGE_THRESHOLD = 100;
const SCROLL_SPEED = 10;

export class AutoScrollController {
  private _interval?: number;

  checkYAutoScroll(clientY: number): void {
    const scrollContainer = document.documentElement;
    if (clientY < EDGE_THRESHOLD) {
      this._startScroll(scrollContainer, "y", -SCROLL_SPEED);
    } else if (clientY > window.innerHeight - EDGE_THRESHOLD) {
      this._startScroll(scrollContainer, "y", SCROLL_SPEED);
    } else {
      this.stop();
    }
  }

  checkXAutoScroll(clientX: number, draggingDOMs: DraggingDOMs): void {
    const scrollContainer = draggingDOMs.table.closest<HTMLElement>(".tableWrapper");
    if (!scrollContainer) return;

    const editorRect = scrollContainer.getBoundingClientRect();
    if (clientX < editorRect.left + EDGE_THRESHOLD) {
      this._startScroll(scrollContainer, "x", -SCROLL_SPEED);
    } else if (clientX > editorRect.right - EDGE_THRESHOLD) {
      this._startScroll(scrollContainer, "x", SCROLL_SPEED);
    } else {
      this.stop();
    }
  }

  stop(): void {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = undefined;
    }
  }

  private _startScroll(
    el: HTMLElement,
    axis: "x" | "y",
    speed: number,
  ): void {
    if (this._interval) clearInterval(this._interval);
    this._interval = window.setInterval(() => {
      if (axis === "x") el.scrollLeft += speed;
      else el.scrollTop += speed;
    }, 16);
  }
}
