import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const CornerDownLeftIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M21 4C21 3.45 20.55 3 20 3C19.45 3 19 3.45 19 4V11C19 11.8 18.68 12.56 18.12 13.12C17.56 13.68 16.8 14 16 14H6.41L9.71 10.71C10.1 10.32 10.1 9.68 9.71 9.29C9.32 8.9 8.68 8.9 8.29 9.29L3.29 14.29C2.9 14.68 2.9 15.32 3.29 15.71L8.29 20.71C8.68 21.1 9.32 21.1 9.71 20.71C10.1 20.32 10.1 19.68 9.71 19.29L6.41 16H16C17.33 16 18.6 15.47 19.54 14.54C20.47 13.6 21 12.33 21 11V4Z"
        fill="currentColor"
      />
    </svg>
  )
})

CornerDownLeftIcon.displayName = "CornerDownLeftIcon"
