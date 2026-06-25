import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const StrikeIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M9 3H16C16.55 3 17 3.45 17 4C17 4.55 16.55 5 16 5H9C8.68 5 8.36 5.08 8.08 5.22C7.8 5.37 7.55 5.58 7.37 5.84C7.18 6.11 7.06 6.41 7.02 6.72C6.97 7.04 7.01 7.36 7.11 7.67C7.3 8.19 7.02 8.76 6.5 8.94C5.98 9.13 5.41 8.85 5.23 8.33C5.01 7.73 4.95 7.08 5.04 6.45C5.12 5.82 5.36 5.21 5.73 4.69C6.1 4.17 6.59 3.74 7.16 3.45C7.73 3.15 8.36 3 9 3Z"
        fill="currentColor"
      />
      <path
        d="M18 13H20C20.55 13 21 12.55 21 12C21 11.45 20.55 11 20 11H4C3.45 11 3 11.45 3 12C3 12.55 3.45 13 4 13H14C14.8 13 15.56 13.32 16.12 13.88C16.68 14.44 17 15.2 17 16C17 16.8 16.68 17.56 16.12 18.12C15.56 18.68 14.8 19 14 19H6C5.45 19 5 19.45 5 20C5 20.55 5.45 21 6 21H14C15.33 21 16.6 20.47 17.54 19.54C18.47 18.6 19 17.33 19 16C19 14.91 18.65 13.86 18 13Z"
        fill="currentColor"
      />
    </svg>
  )
})

StrikeIcon.displayName = "StrikeIcon"
