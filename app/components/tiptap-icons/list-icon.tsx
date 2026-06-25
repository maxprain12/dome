import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const ListIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M7 6C7 5.45 7.45 5 8 5H21C21.55 5 22 5.45 22 6C22 6.55 21.55 7 21 7H8C7.45 7 7 6.55 7 6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 12C7 11.45 7.45 11 8 11H21C21.55 11 22 11.45 22 12C22 12.55 21.55 13 21 13H8C7.45 13 7 12.55 7 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 18C7 17.45 7.45 17 8 17H21C21.55 17 22 17.45 22 18C22 18.55 21.55 19 21 19H8C7.45 19 7 18.55 7 18Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 6C2 5.45 2.45 5 3 5H3.01C3.56 5 4.01 5.45 4.01 6C4.01 6.55 3.56 7 3.01 7H3C2.45 7 2 6.55 2 6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 12C2 11.45 2.45 11 3 11H3.01C3.56 11 4.01 11.45 4.01 12C4.01 12.55 3.56 13 3.01 13H3C2.45 13 2 12.55 2 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 18C2 17.45 2.45 17 3 17H3.01C3.56 17 4.01 17.45 4.01 18C4.01 18.55 3.56 19 3.01 19H3C2.45 19 2 18.55 2 18Z"
        fill="currentColor"
      />
    </svg>
  )
})

ListIcon.displayName = "ListIcon"
