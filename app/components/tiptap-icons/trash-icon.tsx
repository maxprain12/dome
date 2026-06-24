import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const TrashIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M7 5V4C7 3.17 7.4 2.43 7.92 1.92C8.43 1.4 9.17 1 10 1H14C14.83 1 15.57 1.4 16.08 1.92C16.6 2.43 17 3.17 17 4V5H21C21.55 5 22 5.45 22 6C22 6.55 21.55 7 21 7H20V20C20 20.83 19.6 21.57 19.08 22.08C18.57 22.6 17.83 23 17 23H7C6.17 23 5.43 22.6 4.92 22.08C4.4 21.57 4 20.83 4 20V7H3C2.45 7 2 6.55 2 6C2 5.45 2.45 5 3 5H7ZM9 4C9 3.83 9.1 3.57 9.33 3.33C9.57 3.1 9.83 3 10 3H14C14.17 3 14.43 3.1 14.67 3.33C14.9 3.57 15 3.83 15 4V5H9V4ZM6 7V20C6 20.17 6.1 20.43 6.33 20.67C6.57 20.9 6.83 21 7 21H17C17.17 21 17.43 20.9 17.67 20.67C17.9 20.43 18 20.17 18 20V7H6Z"
        fill="currentColor"
      />
    </svg>
  )
})

TrashIcon.displayName = "TrashIcon"
