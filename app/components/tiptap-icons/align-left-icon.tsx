import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const AlignLeftIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M2 12C2 11.45 2.45 11 3 11H15C15.55 11 16 11.45 16 12C16 12.55 15.55 13 15 13H3C2.45 13 2 12.55 2 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 18C2 17.45 2.45 17 3 17H17C17.55 17 18 17.45 18 18C18 18.55 17.55 19 17 19H3C2.45 19 2 18.55 2 18Z"
        fill="currentColor"
      />
    </svg>
  )
})

AlignLeftIcon.displayName = "AlignLeftIcon"
