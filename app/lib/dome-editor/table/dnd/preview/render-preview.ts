// Copyright (c) 2025 Dome contributors. MIT License.

export function clearPreviewDOM(previewRoot: HTMLElement): void {
  while (previewRoot.firstChild) {
    previewRoot.removeChild(previewRoot.firstChild);
  }
}

export function createPreviewDOM(
  table: HTMLTableElement,
  previewRoot: HTMLElement,
  index: number | undefined,
  direction: "row" | "col",
): void {
  clearPreviewDOM(previewRoot);

  const previewTable = document.createElement("table");
  const previewBody = document.createElement("tbody");
  previewTable.appendChild(previewBody);
  previewRoot.appendChild(previewTable);

  const rows = table.querySelectorAll("tr");

  if (direction === "row") {
    if (index != null) {
      const row = rows[index];
      if (row) previewBody.appendChild(row.cloneNode(true));
    }
  } else {
    rows.forEach((row) => {
      const rowClone = row.cloneNode(false) as HTMLElement;
      const cells = row.querySelectorAll("th,td");
      if (index != null && cells[index]) {
        rowClone.appendChild(cells[index].cloneNode(true));
        previewBody.appendChild(rowClone);
      }
    });
  }
}
