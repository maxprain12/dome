import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const AlignRightIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M2 6C2 5.45 2.45 5 3 5H21C21.55 5 22 5.45 22 6C22 6.55 21.55 7 21 7H3C2.45 7 2 6.55 2 6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 12C8 11.45 8.45 11 9 11H21C21.55 11 22 11.45 22 12C22 12.55 21.55 13 21 13H9C8.45 13 8 12.55 8 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 18C6 17.45 6.45 17 7 17H21C21.55 17 22 17.45 22 18C22 18.55 21.55 19 21 19H7C6.45 19 6 18.55 6 18Z"
        fill="currentColor"
      />
    </svg>
  )
})

AlignRightIcon.displayName = "AlignRightIcon"
