import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const CloseIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M18.71 6.71C19.1 6.32 19.1 5.68 18.71 5.29C18.32 4.9 17.68 4.9 17.29 5.29L12 10.59L6.71 5.29C6.32 4.9 5.68 4.9 5.29 5.29C4.9 5.68 4.9 6.32 5.29 6.71L10.59 12L5.29 17.29C4.9 17.68 4.9 18.32 5.29 18.71C5.68 19.1 6.32 19.1 6.71 18.71L12 13.41L17.29 18.71C17.68 19.1 18.32 19.1 18.71 18.71C19.1 18.32 19.1 17.68 18.71 17.29L13.41 12L18.71 6.71Z"
        fill="currentColor"
      />
    </svg>
  )
})

CloseIcon.displayName = "CloseIcon"
