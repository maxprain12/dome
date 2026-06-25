import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HeadingTwoIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M22 12C22 10.76 21.17 9.79 20.07 9.43C18.95 9.06 17.62 9.29 16.4 10.2C15.96 10.53 15.87 11.16 16.2 11.6C16.53 12.04 17.16 12.13 17.6 11.8C18.38 11.21 19.05 11.19 19.43 11.32C19.83 11.46 20 11.74 20 12C20 12.48 19.86 12.74 19.65 12.95C19.43 13.18 19.14 13.36 18.71 13.63C18.63 13.68 18.55 13.73 18.47 13.78C17.96 14.1 17.31 14.53 16.82 15.21C16.3 15.92 16 16.82 16 18C16 18.55 16.45 19 17 19H21C21.55 19 22 18.55 22 18C22 17.45 21.55 17 21 17H18.13C18.21 16.74 18.32 16.54 18.43 16.39C18.69 16.04 19.04 15.78 19.53 15.47C19.59 15.44 19.65 15.4 19.72 15.36C20.14 15.1 20.68 14.77 21.1 14.33C21.64 13.76 22 13.02 22 12Z"
        fill="currentColor"
      />
    </svg>
  )
})

HeadingTwoIcon.displayName = "HeadingTwoIcon"
