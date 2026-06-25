import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HeadingIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M6 3C6.55 3 7 3.45 7 4V11H17V4C17 3.45 17.45 3 18 3C18.55 3 19 3.45 19 4V20C19 20.55 18.55 21 18 21C17.45 21 17 20.55 17 20V13H7V20C7 20.55 6.55 21 6 21C5.45 21 5 20.55 5 20V4C5 3.45 5.45 3 6 3Z"
        fill="currentColor"
      />
    </svg>
  )
})

HeadingIcon.displayName = "HeadingIcon"
