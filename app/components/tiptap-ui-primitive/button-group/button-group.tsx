import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import type { VariantProps } from "class-variance-authority"
import { cn } from "@/lib/tiptap-utils"
import { Separator } from "@/components/tiptap-ui-primitive/separator"
import { buttonGroupVariants } from "./button-group-variants"
import "./button-group.scss"

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"fieldset"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <fieldset
      data-slot="tiptap-button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), 'border-0 p-0 m-0 min-w-0', className)}
      {...props}
    />
  )
}

function ButtonGroupText({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      { className: cn("tiptap-button-group-text", className) },
      props
    ),
    render,
    state: { slot: "tiptap-button-group-text" },
  })
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="tiptap-button-group-separator"
      orientation={orientation}
      className={cn("tiptap-button-group-separator", className)}
      {...props}
    />
  )
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
}
