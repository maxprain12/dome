import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const BlockquoteIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 6C8 5.45 8.45 5 9 5H16C16.55 5 17 5.45 17 6C17 6.55 16.55 7 16 7H9C8.45 7 8 6.55 8 6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 3C4.55 3 5 3.45 5 4L5 20C5 20.55 4.55 21 4 21C3.45 21 3 20.55 3 20L3 4C3 3.45 3.45 3 4 3Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 12C8 11.45 8.45 11 9 11H20C20.55 11 21 11.45 21 12C21 12.55 20.55 13 20 13H9C8.45 13 8 12.55 8 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 18C8 17.45 8.45 17 9 17H16C16.55 17 17 17.45 17 18C17 18.55 16.55 19 16 19H9C8.45 19 8 18.55 8 18Z"
        fill="currentColor"
      />
    </svg>
  )
})

BlockquoteIcon.displayName = "BlockquoteIcon"
