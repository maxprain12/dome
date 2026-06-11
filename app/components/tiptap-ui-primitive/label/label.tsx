"use client"

import * as React from "react"
import { cn } from "@/lib/tiptap-utils"

import "./label.scss"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- callers associate via props spread
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- callers associate via props spread
    <label
      data-slot="tiptap-label"
      className={cn("tiptap-label", className)}
      {...props}
    />
  )
}

export { Label }
