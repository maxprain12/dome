import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-xs/relaxed font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-[var(--duration-press)] ease-[var(--ease-out)] outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--tint-strong)_55%,transparent)] active:not-aria-[haspopup]:scale-[0.97] motion-reduce:transition-none motion-reduce:active:not-aria-[haspopup]:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(180deg,oklch(0.38_0_0),oklch(0.25_0_0))] text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.18),0_1px_2px_oklch(0_0_0/0.25)] hover:bg-[linear-gradient(180deg,oklch(0.44_0_0),oklch(0.3_0_0))] dark:bg-[linear-gradient(180deg,oklch(1_0_0),oklch(0.9_0_0))] dark:text-[oklch(0.2_0_0)] dark:hover:bg-[linear-gradient(180deg,oklch(1_0_0),oklch(0.95_0_0))]",
        outline:
          "bg-foreground/[0.05] text-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:bg-foreground/[0.09] aria-expanded:bg-foreground/[0.09] aria-expanded:text-foreground",
        secondary:
          "bg-foreground/[0.05] text-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:bg-foreground/[0.09] aria-expanded:bg-foreground/[0.09] aria-expanded:text-foreground",
        soft:
          "bg-muted text-foreground hover:bg-muted/80 aria-expanded:bg-muted",
        ghost:
          "hover:bg-foreground/[0.07] hover:text-foreground aria-expanded:bg-foreground/[0.07] aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "h-auto px-1 font-medium text-foreground underline decoration-input underline-offset-[3px]",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3.5 text-[0.8125rem]/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-[22px] gap-1 px-2.5 text-[0.6875rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-7 gap-1 px-3 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-[38px] gap-1.5 px-4 text-[0.8125rem]/relaxed has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-[22px] [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-[38px] [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonPrimitive.Props &
    VariantProps<typeof buttonVariants> & { loading?: boolean; inert?: boolean }
>(function Button(
  { className, variant = "default", size = "default", loading = false, children, disabled, inert, ...props },
  ref
) {
  // React 18's DOM types don't serialize a boolean `inert` attribute (added in
  // React 19); some upstream components (e.g. message-scroller) pass it as a
  // boolean via the `render` prop, so it's normalized to a string here before
  // reaching the native <button> (@base-ui/react's Props type has no `inert`
  // field either, hence the cast).
  const inertProps =
    inert === undefined ? {} : { inert: inert ? "" : undefined }

  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
      {...(inertProps as Record<string, unknown>)}
    >
      {loading ? <Spinner className="size-3.5" aria-hidden /> : null}
      {children}
    </ButtonPrimitive>
  )
})

export { Button, buttonVariants }
