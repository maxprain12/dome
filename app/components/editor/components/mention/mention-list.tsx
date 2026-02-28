import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActionIcon,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Text,
  UnstyledButton,
} from "@mantine/core";
import clsx from "clsx";
import classes from "./mention.module.css";
import { IconFileDescription } from "@tabler/icons-react";
import { v7 as uuid7 } from "uuid";
import type {
  MentionListProps,
  MentionSuggestionItem,
} from "@/components/editor/components/mention/mention.type";

interface DomeNote {
  id: string;
  title: string;
  icon?: string;
  slug_id?: string;
}

const MentionList = forwardRef<any, MentionListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [renderItems, setRenderItems] = useState<MentionSuggestionItem[]>([]);

  // Search local notes via Electron IPC
  useEffect(() => {
    const query = props.query;

    async function searchNotes() {
      const electron = (window as any).electron;
      if (!electron?.db?.notes?.search) {
        setRenderItems([]);
        return;
      }

      try {
        const projectId = (window as any).__domeCurrentProjectId || "default";
        const result = await electron.db.notes.search(query || "", projectId);

        if (result?.success && Array.isArray(result.data)) {
          const notes: DomeNote[] = result.data.slice(0, 10);

          const items: MentionSuggestionItem[] = [];

          if (notes.length > 0) {
            items.push({ entityType: "header", label: "Notas" });
            items.push(
              ...notes.map((note) => ({
                id: uuid7(),
                label: note.title || "Sin título",
                entityType: "page" as const,
                entityId: note.id,
                slugId: note.slug_id || note.id,
                icon: note.icon || null,
              })),
            );
          }

          setRenderItems(items);
          // @ts-ignore
          props.editor.storage.mentionItems = items;
        } else {
          setRenderItems([]);
        }
      } catch (err) {
        console.error("[MentionList] Search error:", err);
        setRenderItems([]);
      }
    }

    searchNotes();
  }, [props.query]);

  const selectItem = useCallback(
    (index: number) => {
      const item = renderItems?.[index];
      if (item && item.entityType === "page") {
        props.command({
          id: item.id,
          label: item.label || "Sin título",
          entityType: "page",
          entityId: item.entityId,
          slugId: item.slugId,
        });
      }
    },
    [renderItems, props],
  );

  const upHandler = () => {
    if (!renderItems.length) return;
    let newIndex = selectedIndex;
    do {
      newIndex = (newIndex + renderItems.length - 1) % renderItems.length;
    } while (renderItems[newIndex].entityType === "header");
    setSelectedIndex(newIndex);
  };

  const downHandler = () => {
    if (!renderItems.length) return;
    let newIndex = selectedIndex;
    do {
      newIndex = (newIndex + 1) % renderItems.length;
    } while (renderItems[newIndex].entityType === "header");
    setSelectedIndex(newIndex);
  };

  const enterHandler = () => {
    if (!renderItems.length) return;
    if (renderItems[selectedIndex]?.entityType !== "header") {
      selectItem(selectedIndex);
    }
  };

  useEffect(() => {
    setSelectedIndex(1);
  }, [props.query]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }
      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }
      if (event.key === "Enter") {
        if (renderItems.length === 0) {
          return false;
        }
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  useEffect(() => {
    viewportRef.current
      ?.querySelector(`[data-item-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (renderItems.length === 0) {
    return (
      <Paper id="mention" shadow="md" py="xs" withBorder radius="md">
        <Text c="dimmed" size="sm" px="sm">
          Sin resultados
        </Text>
      </Paper>
    );
  }

  return (
    <Paper id="mention" shadow="md" withBorder radius="md" py={6}>
      <ScrollArea.Autosize
        viewportRef={viewportRef}
        mah={350}
        w={320}
        scrollbarSize={6}
      >
        {renderItems?.map((item, index) => {
          if (item.entityType === "header") {
            const isFirst = index === 0;
            return (
              <div key={`${item.label}-${index}`}>
                {!isFirst && <Divider my={6} />}
                <Text
                  c="dimmed"
                  size="xs"
                  fw={500}
                  px="sm"
                  pt={isFirst ? 2 : 4}
                  pb={4}
                  tt="uppercase"
                >
                  {item.label}
                </Text>
              </div>
            );
          } else if (item.entityType === "page") {
            return (
              <UnstyledButton
                data-item-index={index}
                key={index}
                onClick={() => selectItem(index)}
                className={clsx(classes.menuBtn, {
                  [classes.selectedItem]: index === selectedIndex,
                })}
                px="sm"
              >
                <Group gap="sm" wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    component="div"
                    aria-label={item.label}
                    color="gray"
                    size="sm"
                  >
                    {item.icon || (
                      <IconFileDescription size={18} stroke={1.5} />
                    )}
                  </ActionIcon>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {item.label}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
            );
          } else {
            return null;
          }
        })}
      </ScrollArea.Autosize>
    </Paper>
  );
});

export default MentionList;
