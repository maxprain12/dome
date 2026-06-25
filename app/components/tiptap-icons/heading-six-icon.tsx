import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HeadingSixIcon = memo(({ className, ...props }: SvgProps) => {
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
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.71 9.29C21.1 9.68 21.1 10.32 20.71 10.71C19.84 11.58 19.22 12.29 18.79 13.01C18.86 13 18.93 13 19 13C20.66 13 22 14.34 22 16C22 17.66 20.66 19 19 19C17.34 19 16 17.66 16 16C16 14.6 16.28 13.44 16.87 12.34C17.44 11.27 18.27 10.31 19.29 9.29C19.68 8.9 20.32 8.9 20.71 9.29ZM19 17C18.45 17 18 16.55 18 16C18 15.45 18.45 15 19 15C19.55 15 20 15.45 20 16C20 16.55 19.55 17 19 17Z"
        fill="currentColor"
      />
    </svg>
  )
})

HeadingSixIcon.displayName = "HeadingSixIcon"
