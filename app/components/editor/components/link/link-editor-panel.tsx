import React from "react";
import { Button, Group, TextInput } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { useLinkEditorState } from "@/components/editor/components/link/use-link-editor-state.tsx";
import type { LinkEditorPanelProps } from "@/components/editor/components/link/types.ts";
import { useTranslation } from "react-i18next";

export const LinkEditorPanel = ({
  onSetLink,
  initialUrl,
}: LinkEditorPanelProps) => {
  const { t } = useTranslation();
  const state = useLinkEditorState({
    onSetLink,
    initialUrl,
  });

  return (
    <div>
      <form onSubmit={state.handleSubmit}>
        <Group gap="xs" style={{ flex: 1 }} wrap="nowrap">
          <TextInput
            leftSection={<IconLink size={16} />}
            variant="filled"
            placeholder={t("Paste link")}
            value={state.url}
            onChange={state.onChange}
          />
          <Button p={"xs"} type="submit" disabled={!state.isValidUrl}>
            {t("Save")}
          </Button>
        </Group>
      </form>
    </div>
  );
};
