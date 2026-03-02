import React, { useCallback, useEffect } from "react";
import { useRef } from "react";
import type {
  EditorMenuProps,
  ShouldShowProps,
} from "@/components/editor/components/table/types/types.ts";
import { isCellSelection } from "@docmost/editor-ext";
import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconBoxMargin,
  IconColumnRemove,
  IconRowRemove,
  IconSquareToggle,
  IconTableRow,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { TableBackgroundColor } from "./table-background-color";
import { TableTextAlignment } from "./table-text-alignment";
import { BubbleMenu } from "@tiptap/react/menus";
import classes from "../common/toolbar-menu.module.css";

export const TableCellMenu = React.memo(
  ({ editor, appendTo, shouldHide }: EditorMenuProps): JSX.Element => {
    const { t } = useTranslation();
    const shouldHideRef = useRef(!!shouldHide);

    useEffect(() => {
      shouldHideRef.current = !!shouldHide;
    }, [shouldHide]);

    const shouldShow = useCallback(
      ({ state }: ShouldShowProps) => {
        return !!state && isCellSelection(state.selection);
      },
      []
    );

    const mergeCells = useCallback(() => {
      editor.chain().focus().mergeCells().run();
    }, [editor]);

    const splitCell = useCallback(() => {
      editor.chain().focus().splitCell().run();
    }, [editor]);

    const deleteColumn = useCallback(() => {
      editor.chain().focus().deleteColumn().run();
    }, [editor]);

    const deleteRow = useCallback(() => {
      editor.chain().focus().deleteRow().run();
    }, [editor]);

    const toggleHeaderCell = useCallback(() => {
      editor.chain().focus().toggleHeaderCell().run();
    }, [editor]);

    return (
      <BubbleMenu
        editor={editor}
        pluginKey="table-cell-menu"
        updateDelay={0}
        appendTo={() => {
          return appendTo?.current ?? (editor.options.element as HTMLElement);
        }}
        ref={(element) => {
          if (!element) return;
          element.style.zIndex = "1100";
        }}
        options={{
          offset: {
            mainAxis: 15,
          },
        }}
        shouldShow={shouldShow}
      >
        <div className={classes.toolbar}>
          <TableBackgroundColor editor={editor} />
          <TableTextAlignment editor={editor} />

          <div className={classes.divider} />

          <Tooltip position="top" label={t("Merge cells")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={mergeCells}
              variant="subtle"
              size="lg"
              aria-label={t("Merge cells")}
            >
              <IconBoxMargin size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip position="top" label={t("Split cell")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={splitCell}
              variant="subtle"
              size="lg"
              aria-label={t("Split cell")}
            >
              <IconSquareToggle size={18} />
            </ActionIcon>
          </Tooltip>

          <div className={classes.divider} />

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

          <Tooltip position="top" label={t("Toggle header cell")}>
            <ActionIcon
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleHeaderCell}
              variant="subtle"
              size="lg"
              aria-label={t("Toggle header cell")}
            >
              <IconTableRow size={18} />
            </ActionIcon>
          </Tooltip>
        </div>
      </BubbleMenu>
    );
  }
);

export default TableCellMenu;
