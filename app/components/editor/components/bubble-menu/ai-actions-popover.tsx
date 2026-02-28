import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  IconFileText,
  IconArrowAutofitContent,
  IconWand,
  IconLanguage,
  IconArrowRight,
  IconChecklist,
  IconEdit,
  IconLoader2,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  executeEditorAIActionStreaming,
  type EditorAIAction,
} from "@/lib/ai/editor-ai";
import { Button, TextInput } from "@mantine/core";
import classes from "./bubble-menu.module.css";

const AI_ACTIONS: { action: EditorAIAction; labelKey: string; icon: typeof IconFileText }[] = [
  { action: "summarize", labelKey: "Summarize", icon: IconFileText },
  { action: "expand", labelKey: "Expand", icon: IconArrowAutofitContent },
  { action: "improve", labelKey: "Improve", icon: IconWand },
  { action: "translate", labelKey: "Translate", icon: IconLanguage },
  { action: "continue", labelKey: "Continue", icon: IconArrowRight },
  { action: "review", labelKey: "Review", icon: IconChecklist },
];

interface AiActionsPopoverProps {
  editor: Editor | null;
  onClose: () => void;
}

export function AiActionsPopover({ editor, onClose }: AiActionsPopoverProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (editor) {
      selectionRef.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
    }
  }, [editor]);

  const getSelectedText = useCallback(() => {
    if (!editor) return "";
    const sel = selectionRef.current ?? editor.state.selection;
    return editor.state.doc.textBetween(sel.from, sel.to, "\n");
  }, [editor]);

  const getDocumentContext = useCallback(() => {
    if (!editor) return "";
    const doc = editor.state.doc;
    const sel = selectionRef.current ?? editor.state.selection;
    const before = doc.textBetween(Math.max(0, sel.from - 500), sel.from, "\n");
    const after = doc.textBetween(sel.to, Math.min(doc.content.size, sel.to + 500), "\n");
    return `${before}\n[...selected...]\n${after}`;
  }, [editor]);

  const runAction = useCallback(
    async (action: EditorAIAction, custom?: string) => {
      if (!editor) return;
      const sel = selectionRef.current ?? editor.state.selection;
      const selectedText = getSelectedText();
      if (!selectedText.trim()) {
        setError(t("Please select some text first"));
        return;
      }

      setLoading(true);
      setError(null);
      abortControllerRef.current = new AbortController();

      try {
        const documentContext = getDocumentContext();
        const result = await executeEditorAIActionStreaming(
          action,
          selectedText,
          documentContext,
          () => {},
          custom,
          abortControllerRef.current.signal,
        );

        editor
          .chain()
          .focus()
          .deleteRange({ from: sel.from, to: sel.to })
          .insertContent(result)
          .run();

        onClose();
        setShowCustomInput(false);
        setCustomPrompt("");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [editor, getSelectedText, getDocumentContext, onClose, t],
  );

  if (!editor) return null;

  return (
    <div className={classes.aiPopover}>
      {error && (
        <div className={classes.aiPopoverError} role="alert">
          {error}
        </div>
      )}

      {showCustomInput ? (
        <div className={classes.aiPopoverCustomSection}>
          <TextInput
            placeholder={t("Describe what you want...")}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                runAction("custom", customPrompt);
              }
              if (e.key === "Escape") {
                setShowCustomInput(false);
              }
            }}
            disabled={loading}
            size="sm"
            autoFocus
            classNames={{ input: classes.aiPopoverCustomInput }}
          />
          <div className={classes.aiPopoverCustomActions}>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setShowCustomInput(false)}
              disabled={loading}
            >
              {t("Cancel")}
            </Button>
            <Button
              size="xs"
              onClick={() => runAction("custom", customPrompt)}
              disabled={loading || !customPrompt.trim()}
            >
              {loading ? <IconLoader2 size={14} className={classes.aiPopoverSpin} /> : t("Apply")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={classes.aiPopoverActions}>
          {AI_ACTIONS.map(({ action, labelKey, icon: Icon }) => (
            <button
              key={action}
              type="button"
              className={classes.aiPopoverActionBtn}
              onClick={() => runAction(action)}
              disabled={loading}
            >
              {loading ? (
                <IconLoader2 size={14} className={classes.aiPopoverSpin} />
              ) : (
                <Icon size={14} />
              )}
              {t(labelKey)}
            </button>
          ))}
          <button
            type="button"
            className={classes.aiPopoverActionBtn}
            onClick={() => setShowCustomInput(true)}
            disabled={loading}
          >
            <IconEdit size={14} />
            {t("Custom")}
          </button>
        </div>
      )}
    </div>
  );
}
