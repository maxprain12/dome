import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Text } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import classes from "./mention.module.css";

export default function MentionView(props: NodeViewProps) {
  const { node } = props;
  const { label, entityType, entityId, slugId } = node.attrs;
  const navigate = useNavigate();

  const handlePageClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const noteId = entityId || slugId;
    if (noteId) {
      navigate(`/workspace?id=${noteId}`);
    }
  };

  return (
    <NodeViewWrapper style={{ display: "inline" }} data-drag-handle>
      {entityType === "user" && (
        <Text className={classes.userMention} component="span">
          @{label}
        </Text>
      )}

      {entityType === "page" && (
        <span
          role="link"
          tabIndex={0}
          onClick={handlePageClick}
          onKeyDown={(e) => e.key === "Enter" && handlePageClick(e as any)}
          className={classes.pageMentionLink}
          style={{ cursor: "pointer", fontWeight: 500 }}
        >
          <ActionIcon
            variant="transparent"
            color="gray"
            component="span"
            size={18}
            style={{ verticalAlign: "text-bottom" }}
          >
            <IconFileDescription size={18} />
          </ActionIcon>
          <span className={classes.pageMentionText}>{label}</span>
        </span>
      )}
    </NodeViewWrapper>
  );
}
