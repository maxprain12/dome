// Copyright (c) 2025 Dome contributors. MIT License.

function findDragOverElement(
  elements: Element[],
  pointer: number,
  axis: "x" | "y",
): [Element, number] | undefined {
  const startProp = axis === "x" ? "left" : "top";
  const endProp = axis === "x" ? "right" : "bottom";
  const lastIndex = elements.length - 1;

  const index = elements.findIndex((el, i) => {
    const rect = el.getBoundingClientRect();
    const start = rect[startProp];
    const end = rect[endProp];

    if (start <= pointer && pointer <= end) return true;
    if (i === lastIndex && pointer > end) return true;
    if (i === 0 && pointer < start) return true;
    return false;
  });

  return index >= 0 ? [elements[index], index] : undefined;
}

export function getDragOverColumn(
  table: HTMLTableElement,
  pointerX: number,
): [element: Element, index: number] | undefined {
  const firstRow = table.querySelector("tr");
  if (!firstRow) return;
  return findDragOverElement(Array.from(firstRow.children), pointerX, "x");
}

export function getDragOverRow(
  table: HTMLTableElement,
  pointerY: number,
): [element: Element, index: number] | undefined {
  return findDragOverElement(
    Array.from(table.querySelectorAll("tr")),
    pointerY,
    "y",
  );
}
