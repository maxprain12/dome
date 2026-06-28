export type SpacerOrientation = "horizontal" | "vertical"

const EMPTY_STYLE: React.CSSProperties = {}

export function Spacer({
  orientation = "horizontal",
  size,
  style = EMPTY_STYLE,
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: SpacerOrientation
  size?: string | number
}) {
  const computedStyle = {
    ...style,
    ...(orientation === "horizontal" && !size && { flex: 1 }),
    ...(size && {
      width: orientation === "vertical" ? "1px" : size,
      height: orientation === "horizontal" ? "1px" : size,
    }),
  }

  return <div {...props} style={computedStyle} />
}
