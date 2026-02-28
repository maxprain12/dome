import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { Group, Text, Paper, ActionIcon, Loader } from "@mantine/core";
import { IconDownload, IconPaperclip } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";

function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

async function openAttachment(url: string, name: string) {
  if (!url) return;

  const electron = (window as any).electron;

  // Handle dome-resource:// scheme
  if (url.startsWith("dome-resource://")) {
    const resourceId = url.replace("dome-resource://", "").split("/")[0];
    if (electron?.resource?.getFilePath) {
      const result = await electron.resource.getFilePath(resourceId);
      if (result?.success && result.data) {
        electron?.openPath?.(result.data);
        return;
      }
    }
  }

  // Handle regular URLs (legacy Docmost format or http)
  if (url.startsWith("http") || url.startsWith("/")) {
    window.open(url, "_blank");
  }
}

export default function AttachmentView(props: NodeViewProps) {
  const { node, selected } = props;
  const { url, name, size } = node.attrs;
  const { hovered, ref } = useHover();

  return (
    <NodeViewWrapper>
      <Paper withBorder p="4px" ref={ref} data-drag-handle>
        <Group
          justify="space-between"
          gap="xl"
          style={{ cursor: "pointer" }}
          wrap="nowrap"
          h={25}
        >
          <Group wrap="nowrap" gap="sm" style={{ minWidth: 0, flex: 1 }}>
            {url ? (
              <IconPaperclip size={20} style={{ flexShrink: 0 }} />
            ) : (
              <Loader size={20} style={{ flexShrink: 0 }} />
            )}

            <Text component="span" size="md" truncate="end" style={{ minWidth: 0 }}>
              {url ? name : `Subiendo ${name}...`}
            </Text>

            <Text component="span" size="sm" c="dimmed" style={{ flexShrink: 0 }}>
              {formatBytes(size)}
            </Text>
          </Group>

          {url && (selected || hovered) && (
            <ActionIcon
              variant="default"
              aria-label="download file"
              onClick={() => openAttachment(url, name)}
            >
              <IconDownload size={18} />
            </ActionIcon>
          )}
        </Group>
      </Paper>
    </NodeViewWrapper>
  );
}
