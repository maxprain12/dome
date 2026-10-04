import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full resize-none rounded-xl border border-transparent bg-muted px-3 py-[9px] text-[0.8125rem]/normal transition-[color,background-color,border-color,box-shadow] outline-none placeholder:text-muted-foreground hover:bg-muted/85 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-[color-mix(in_oklab,var(--tint-strong)_40%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
          className
        )}
        {...props}
      />
    )
  }
)

export { Textarea }
