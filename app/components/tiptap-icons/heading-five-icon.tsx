import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HeadingFiveIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M16 10C16 9.45 16.45 9 17 9H21C21.55 9 22 9.45 22 10C22 10.55 21.55 11 21 11H18V12H18.3C20.28 12 22 13.47 22 15.5C22 17.53 20.28 19 18.3 19C17.65 19 17.09 18.86 16.55 18.59C16.06 18.35 15.86 17.75 16.11 17.25C16.35 16.76 16.95 16.56 17.45 16.81C17.71 16.94 17.95 17 18.3 17C19.32 17 20 16.27 20 15.5C20 14.73 19.32 14 18.3 14H17C16.45 14 16 13.55 16 13L16 12.99V10Z"
        fill="currentColor"
      />
    </svg>
  )
})

HeadingFiveIcon.displayName = "HeadingFiveIcon"
