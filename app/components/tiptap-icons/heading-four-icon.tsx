import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HeadingFourIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M4 5C4.55 5 5 5.45 5 6V11H11V6C11 5.45 11.45 5 12 5C12.55 5 13 5.45 13 6V18C13 18.55 12.55 19 12 19C11.45 19 11 18.55 11 18V13H5V18C5 18.55 4.55 19 4 19C3.45 19 3 18.55 3 18V6C3 5.45 3.45 5 4 5Z"
        fill="currentColor"
      />
      <path
        d="M17 9C17.55 9 18 9.45 18 10V13H20V10C20 9.45 20.45 9 21 9C21.55 9 22 9.45 22 10V18C22 18.55 21.55 19 21 19C20.45 19 20 18.55 20 18V15H17C16.45 15 16 14.55 16 14V10C16 9.45 16.45 9 17 9Z"
        fill="currentColor"
      />
    </svg>
  )
})

HeadingFourIcon.displayName = "HeadingFourIcon"
