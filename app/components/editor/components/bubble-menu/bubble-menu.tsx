import type { BubbleMenuProps } from "@tiptap/react/menus";
import { BubbleMenu } from "@tiptap/react/menus";
import { isNodeSelection, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconBold,
  IconChevronDown,
  IconCode,
  IconItalic,
  IconStrikethrough,
  IconUnderline,
  IconMessage,
  IconSparkles,
} from "@tabler/icons-react";
import clsx from "clsx";
import classes from "./bubble-menu.module.css";
import { ActionIcon, Button, Popover, rem, Tooltip } from "@mantine/core";
import { AiActionsPopover } from "./ai-actions-popover";
import { ColorSelector } from "./color-selector";
import { NodeSelector } from "./node-selector";
import { TextAlignmentSelector } from "./text-alignment-selector";
import {
  draftCommentIdAtom,
  showCommentPopupAtom,
} from "@/features/comment/atoms/comment-atom";
import { useAtom, useAtomValue } from "jotai";
import { v7 as uuid7 } from "uuid";
import { isCellSelection, isTextSelected } from "@docmost/editor-ext";
import { LinkSelector } from "@/components/editor/components/bubble-menu/link-selector.tsx";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";

export interface BubbleMenuItem {
  name: string;
  isActive: () => boolean;
  command: () => void;
  icon: typeof IconBold;
}

type EditorBubbleMenuProps = Omit<BubbleMenuProps, "children" | "editor"> & {
  editor: Editor | null;
  shouldHide?: boolean;
};

export const EditorBubbleMenu: FC<EditorBubbleMenuProps> = (props) => {
  const { shouldHide, ...bubbleProps } = props;
  const { t } = useTranslation();
  const [showCommentPopup, setShowCommentPopup] = useAtom(showCommentPopupAtom);
  const workspace = useAtomValue(workspaceAtom);
  const isGenerativeAiEnabled = workspace?.settings?.ai?.generative === true;
  const [, setDraftCommentId] = useAtom(draftCommentIdAtom);
  const showCommentPopupRef = useRef(showCommentPopup);
  const shouldHideRef = useRef(!!shouldHide);

  useEffect(() => {
    showCommentPopupRef.current = showCommentPopup;
  }, [showCommentPopup]);

  useEffect(() => {
    shouldHideRef.current = !!shouldHide;
  }, [shouldHide]);


  const editorState = useEditorState({
    editor: props.editor,
    selector: (ctx) => {
      if (!props.editor) {
        return null;
      }

      return {
        isBold: ctx.editor.isActive("bold"),
        isItalic: ctx.editor.isActive("italic"),
        isUnderline: ctx.editor.isActive("underline"),
        isStrike: ctx.editor.isActive("strike"),
        isCode: ctx.editor.isActive("code"),
        isComment: ctx.editor.isActive("comment"),
      };
    },
  });

  const items: BubbleMenuItem[] = [
    {
      name: "Bold",
      isActive: () => editorState?.isBold,
      command: () => props.editor.chain().focus().toggleBold().run(),
      icon: IconBold,
    },
    {
      name: "Italic",
      isActive: () => editorState?.isItalic,
      command: () => props.editor.chain().focus().toggleItalic().run(),
      icon: IconItalic,
    },
    {
      name: "Underline",
      isActive: () => editorState?.isUnderline,
      command: () => props.editor.chain().focus().toggleUnderline().run(),
      icon: IconUnderline,
    },
    {
      name: "Strike",
      isActive: () => editorState?.isStrike,
      command: () => props.editor.chain().focus().toggleStrike().run(),
      icon: IconStrikethrough,
    },
    {
      name: "Code",
      isActive: () => editorState?.isCode,
      command: () => props.editor.chain().focus().toggleCode().run(),
      icon: IconCode,
    },
  ];

  const commentItem: BubbleMenuItem = {
    name: "Comment",
    isActive: () => editorState?.isComment,
    command: () => {
      const commentId = uuid7();

      props.editor.chain().focus().setCommentDecoration().run();
      setDraftCommentId(commentId);
      setShowCommentPopup(true);
    },
    icon: IconMessage,
  };

  // Stable shouldShow — reads from refs and parameters, never from component state
  const shouldShow = useCallback(({ state, editor }: { state: any; editor: any }) => {
    const { selection } = state;
    const { empty } = selection;
    // Only block when selection CROSSES a table boundary (not when fully inside a cell)
    const hasTableInRange = !empty && !editor.isActive("table")
      ? (() => {
          let hasTable = false;
          state.doc.nodesBetween(selection.from, selection.to, (node: any) => {
            if (node.type.name === "table") {
              hasTable = true;
              return false;
            }
          });
          return hasTable;
        })()
      : false;

    const blocked =
      !editor.isEditable ||
      editor.isActive("image") ||
      editor.isActive("video") ||
      editor.isActive("callout") ||
      editor.isActive("columns") ||
      empty ||
      isNodeSelection(selection) ||
      isCellSelection(selection) ||
      showCommentPopupRef?.current ||
      hasTableInRange;

    return blocked ? false : isTextSelected(editor);
  }, []); // stable: reads from refs and shouldShow params, not component state

  // Stable onHide — setters from useState are always stable references
  const handleHide = useCallback(() => {
    setIsNodeSelectorOpen(false);
    setIsTextAlignmentOpen(false);
    setIsLinkSelectorOpen(false);
    setIsColorSelectorOpen(false);
    setIsAiPopoverOpen(false);
  }, []);

  // Stable options — handleHide is stable (useCallback []) so this never changes
  const bubbleMenuOptions = useMemo(() => ({
    placement: "top" as const,
    offset: 8,
    onHide: handleHide,
  }), [handleHide]);

  const bubbleMenuProps: EditorBubbleMenuProps = {
    ...bubbleProps,
    shouldShow,
    options: bubbleMenuOptions,
  };

  const [isNodeSelectorOpen, setIsNodeSelectorOpen] = useState(false);
  const [isTextAlignmentSelectorOpen, setIsTextAlignmentOpen] = useState(false);
  const [isLinkSelectorOpen, setIsLinkSelectorOpen] = useState(false);
  const [isColorSelectorOpen, setIsColorSelectorOpen] = useState(false);
  const [isAiPopoverOpen, setIsAiPopoverOpen] = useState(false);

  return (
    <BubbleMenu
      {...bubbleMenuProps}
      style={{ zIndex: 1000 }}
    >
      <div className={classes.bubbleMenu}>
        {isGenerativeAiEnabled && (
          <>
            <Popover opened={isAiPopoverOpen} onChange={setIsAiPopoverOpen} withArrow zIndex={1100} position="top">
              <Popover.Target>
                <Tooltip label={t("AI Actions")} withArrow withinPortal={false} disabled={isAiPopoverOpen}>
                  <Button
                    variant="default"
                    className={clsx(classes.buttonRoot, classes.askAiBtn)}
                    radius="0"
                    leftSection={<IconSparkles size={16} />}
                    rightSection={<IconChevronDown size={16} />}
                    onClick={() => {
                      setIsAiPopoverOpen(!isAiPopoverOpen);
                      setIsNodeSelectorOpen(false);
                      setIsTextAlignmentOpen(false);
                      setIsLinkSelectorOpen(false);
                      setIsColorSelectorOpen(false);
                    }}
                  >
                    {t("Ask AI")}
                  </Button>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown>
                <AiActionsPopover
                  editor={props.editor}
                  onClose={() => setIsAiPopoverOpen(false)}
                />
              </Popover.Dropdown>
            </Popover>
            <div className={classes.divider} />
          </>
        )}
        <NodeSelector
          editor={props.editor}
          isOpen={isNodeSelectorOpen}
          setIsOpen={() => {
            setIsNodeSelectorOpen(!isNodeSelectorOpen);
            setIsTextAlignmentOpen(false);
            setIsLinkSelectorOpen(false);
            setIsColorSelectorOpen(false);
          }}
        />

        <TextAlignmentSelector
          editor={props.editor}
          isOpen={isTextAlignmentSelectorOpen}
          setIsOpen={() => {
            setIsTextAlignmentOpen(!isTextAlignmentSelectorOpen);
            setIsNodeSelectorOpen(false);
            setIsLinkSelectorOpen(false);
            setIsColorSelectorOpen(false);
          }}
        />

        <ActionIcon.Group>
          {items.map((item, index) => (
            <Tooltip key={index} label={t(item.name)} withArrow>
              <ActionIcon
                key={index}
                variant="default"
                size="lg"
                radius="0"
                aria-label={t(item.name)}
                className={clsx({ [classes.active]: item.isActive() })}
                style={{ border: "none" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={item.command}
              >
                <item.icon style={{ width: rem(16) }} stroke={2} />
              </ActionIcon>
            </Tooltip>
          ))}
        </ActionIcon.Group>

        <LinkSelector
          editor={props.editor}
          isOpen={isLinkSelectorOpen}
          setIsOpen={(value) => {
            setIsLinkSelectorOpen(value);
            setIsNodeSelectorOpen(false);
            setIsTextAlignmentOpen(false);
            setIsColorSelectorOpen(false);
          }}
        />

        <ColorSelector
          editor={props.editor}
          isOpen={isColorSelectorOpen}
          setIsOpen={() => {
            setIsColorSelectorOpen(!isColorSelectorOpen);
            setIsNodeSelectorOpen(false);
            setIsTextAlignmentOpen(false);
            setIsLinkSelectorOpen(false);
          }}
        />

        <Tooltip label={t(commentItem.name)} withArrow withinPortal={false}>
          <ActionIcon
            variant="default"
            size="lg"
            radius="6px"
            aria-label={t(commentItem.name)}
            style={{ border: "none" }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={commentItem.command}
          >
            <IconMessage size={16} stroke={2} />
          </ActionIcon>
        </Tooltip>
      </div>
    </BubbleMenu>
  );
};
