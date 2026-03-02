// Copyright (c) 2025 Dome contributors. MIT License.

export class EmptyImageController {
  private _emptyImage: HTMLImageElement;

  constructor() {
    this._emptyImage = new Image(1, 1);
    this._emptyImage.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }

  hideDragImage(dataTransfer: DataTransfer): void {
    dataTransfer.effectAllowed = "move";
    dataTransfer.setDragImage(this._emptyImage, 0, 0);
  }

  destroy(): void {
    this._emptyImage.remove();
  }
}
