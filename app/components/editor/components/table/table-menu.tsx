import { posToDOMRect, findParentNode } from "@tiptap/react";
import { Node as PMNode } from "@tiptap/pm/model";
import React, { useCallback, useEffect } from "react";
import { useRef } from "react";
import type {
  EditorMenuProps,
  ShouldShowProps,
} from "@/components/editor/components/table/types/types.ts";
import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconTableColumn,
  IconTableRow,
  IconTrashX,
} from "@tabler/icons-react";
import { BubbleMenu } from "@tiptap/react/menus";
import { isCellSelection } from "@docmost/editor-ext";
import { useTranslation } from "react-i18next";
import classes from "../common/toolbar-menu.module.css";

export const TableMenu = React.memo(
  ({ editor, shouldHide }: EditorMenuProps): JSX.Element => {
    const { t } = useTranslation();
    const shouldHideRef = useRef(!!shouldHide);

    useEffect(() => {
      shouldHideRef.current = !!shouldHide;
    }, [shouldHide]);

    const shouldShow = useCallback(
      ({ state }: ShouldShowProps) => {
        if (!state) return false;
        const { selection } = state;
        // Hide when text is selected (bubble menu handles that) or multi-cell selection
        if (!selection.empty) return false;
        if (isCellSelection(selection)) return false;
        return editor.isActive("table");
      },
      [editor]
    );

    const getReferencedVirtualElement = useCallback(() => {
      const { selection } = editor.state;
      const predicate = (node: PMNode) => node.type.name === "table";
      const parent = findParentNode(predicate)(selection);

      if (parent) {
        const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
        const rect = dom.getBoundingClientRect();
        return {
          getBoundingClientRect: () => rect,
          getClientRects: () => [rect],
        };
      }

      const rect = posToDOMRect(editor.view, selection.from, selection.to);
      return {
        getBoundingClientRect: () => rect,
        getClientRects: () => [rect],
      };
    }, [editor]);

    const toggleHeaderColumn = useCallback(() => {
      editor.chain().focus().toggleHeaderColumn().run();
    }, [editor]);

    const toggleHeaderRow = useCallback(() => {
      editor.chain().focus().toggleHeaderRow().run();
    }, [editor]);

    const addColumnLeft = useCallback(() => {
      editor.chain().focus().addColumnBefore().run();
    }, [editor]);

    const addColumnRight = useCallback(() => {
      editor.chain().focus().addColumnAfter().run();
    }, [editor]);

    const deleteColumn = useCallback(() => {
      editor.chain().focus().deleteColumn().run();
    }, [editor]);

    const addRowAbove = useCallback(() => {
      editor.chain().focus().addRowBefore().run();
    }, [editor]);

    const addRowBelow = useCallback(() => {
      editor.chain().focus().addRowAfter().run();
    }, [editor]);

    const deleteRow = useCallback(() => {
      editor.chain().focus().deleteRow().run();
    }, [editor]);

    const deleteTable = useCallback(() => {
      editor.chain().focus().deleteTable().run();
    }, [editor]);

    return (
      <BubbleMenu
        editor={editor}
        pluginKey="table-menu"
        resizeDelay={0}
        getReferencedVirtualElement={getReferencedVirtualElement}
        ref={(element) => {
          if (!element) return;
          element.style.zIndex = "1100";
        }}
        options={{
          placement: "top",
          offset: {
            mainAxis: 15,
          },
          flip: {
            fallbackPlacements: ["top", "bottom"],
            padding: { top: 35 + 15, left: 8, right: 8, bottom: -Infinity },
            boundary: editor.options.element as HTMLElement,
          },
          shift: {
            padding: 8 + 15,
            crossAxis: true,
          },
        }}
        shouldShow={shouldShow}
      >
        <div className={classes.toolbar}>
          <Tooltip position="top" label={t("Add left column")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={addColumnLeft}
              variant="subtle"
              size="lg"
              aria-label={t("Add left column")}
            >
              <IconColumnInsertLeft size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip position="top" label={t("Add right column")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={addColumnRight}
              variant="subtle"
              size="lg"
              aria-label={t("Add right column")}
            >
              <IconColumnInsertRight size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip position="top" label={t("Delete column")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={deleteColumn}
              variant="subtle"
              size="lg"
              aria-label={t("Delete column")}
            >
              <IconColumnRemove size={18} />
            </ActionIcon>
          </Tooltip>

          <div className={classes.divider} />

          <Tooltip position="top" label={t("Add row above")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={addRowAbove}
              variant="subtle"
              size="lg"
              aria-label={t("Add row above")}
            >
              <IconRowInsertTop size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip position="top" label={t("Add row below")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={addRowBelow}
              variant="subtle"
              size="lg"
              aria-label={t("Add row below")}
            >
              <IconRowInsertBottom size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip position="top" label={t("Delete row")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={deleteRow}
              variant="subtle"
              size="lg"
              aria-label={t("Delete row")}
            >
              <IconRowRemove size={18} />
            </ActionIcon>
          </Tooltip>

          <div className={classes.divider} />

          <Tooltip position="top" label={t("Toggle header row")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleHeaderRow}
              variant="subtle"
              size="lg"
              aria-label={t("Toggle header row")}
            >
              <IconTableRow size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip position="top" label={t("Toggle header column")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleHeaderColumn}
              variant="subtle"
              size="lg"
              aria-label={t("Toggle header column")}
            >
              <IconTableColumn size={18} />
            </ActionIcon>
          </Tooltip>

          <div className={classes.divider} />

          <Tooltip position="top" label={t("Delete table")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={deleteTable}
              variant="subtle"
              size="lg"
              aria-label={t("Delete table")}
            >
              <IconTrashX size={18} />
            </ActionIcon>
          </Tooltip>
        </div>
      </BubbleMenu>
    );
  }
);

export default TableMenu;
