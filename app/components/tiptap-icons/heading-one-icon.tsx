import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HeadingOneIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M5 6C5 5.45 4.55 5 4 5C3.45 5 3 5.45 3 6V18C3 18.55 3.45 19 4 19C4.55 19 5 18.55 5 18V13H11V18C11 18.55 11.45 19 12 19C12.55 19 13 18.55 13 18V6C13 5.45 12.55 5 12 5C11.45 5 11 5.45 11 6V11H5V6Z"
        fill="currentColor"
      />
      <path
        d="M21 10C21 9.63 20.8 9.29 20.47 9.12C20.15 8.94 19.75 8.96 19.45 9.17L16.45 11.17C15.99 11.47 15.86 12.1 16.17 12.55C16.47 13.01 17.1 13.14 17.55 12.83L19 11.87V18C19 18.55 19.45 19 20 19C20.55 19 21 18.55 21 18V10Z"
        fill="currentColor"
      />
    </svg>
  )
})

HeadingOneIcon.displayName = "HeadingOneIcon"
