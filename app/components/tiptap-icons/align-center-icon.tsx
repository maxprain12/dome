import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const AlignCenterIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M6 12C6 11.45 6.45 11 7 11H17C17.55 11 18 11.45 18 12C18 12.55 17.55 13 17 13H7C6.45 13 6 12.55 6 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 18C4 17.45 4.45 17 5 17H19C19.55 17 20 17.45 20 18C20 18.55 19.55 19 19 19H5C4.45 19 4 18.55 4 18Z"
        fill="currentColor"
      />
    </svg>
  )
})

AlignCenterIcon.displayName = "AlignCenterIcon"
