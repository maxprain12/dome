import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const ListOrderedIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M9 6C9 5.45 9.45 5 10 5H21C21.55 5 22 5.45 22 6C22 6.55 21.55 7 21 7H10C9.45 7 9 6.55 9 6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 12C9 11.45 9.45 11 10 11H21C21.55 11 22 11.45 22 12C22 12.55 21.55 13 21 13H10C9.45 13 9 12.55 9 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 18C9 17.45 9.45 17 10 17H21C21.55 17 22 17.45 22 18C22 18.55 21.55 19 21 19H10C9.45 19 9 18.55 9 18Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 6C3 5.45 3.45 5 4 5H5C5.55 5 6 5.45 6 6V10C6 10.55 5.55 11 5 11C4.45 11 4 10.55 4 10V7C3.45 7 3 6.55 3 6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 10C3 9.45 3.45 9 4 9H6C6.55 9 7 9.45 7 10C7 10.55 6.55 11 6 11H4C3.45 11 3 10.55 3 10Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.82 13.04C6.55 13.4 7 14.13 7 15C7 15.58 6.72 16.04 6.49 16.35C6.31 16.58 6.11 16.8 5.91 17H6C6.55 17 7 17.45 7 18C7 18.55 6.55 19 6 19H4C3.45 19 3 18.55 3 18C3 17.42 3.28 16.96 3.51 16.65C3.74 16.34 4.04 16.05 4.27 15.82C4.28 15.81 4.29 15.8 4.29 15.79C4.56 15.53 4.75 15.33 4.89 15.15C4.96 15.05 4.99 14.99 5 14.97C5 14.91 4.98 14.88 4.97 14.87C4.97 14.86 4.95 14.85 4.93 14.83C4.88 14.81 4.71 14.76 4.45 14.89C3.95 15.14 3.35 14.94 3.11 14.45C2.86 13.95 3.06 13.35 3.55 13.11C4.29 12.74 5.12 12.69 5.82 13.04Z"
        fill="currentColor"
      />
    </svg>
  )
})

ListOrderedIcon.displayName = "ListOrderedIcon"
