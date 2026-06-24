import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const ItalicIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M15.02 3H19C19.55 3 20 3.45 20 4C20 4.55 19.55 5 19 5H15.69L10.44 19H14C14.55 19 15 19.45 15 20C15 20.55 14.55 21 14 21H9.02C9.01 21 8.99 21 8.98 21H5C4.45 21 4 20.55 4 20C4 19.45 4.45 19 5 19H8.31L13.56 5H10C9.45 5 9 4.55 9 4C9 3.45 9.45 3 10 3H14.98C14.99 3 15.01 3 15.02 3Z"
        fill="currentColor"
      />
    </svg>
  )
})

ItalicIcon.displayName = "ItalicIcon"
