import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const BoldIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M6 2.5C5.17 2.5 4.5 3.17 4.5 4V20C4.5 20.83 5.17 21.5 6 21.5H15C16.46 21.5 17.86 20.92 18.89 19.89C19.92 18.86 20.5 17.46 20.5 16C20.5 14.54 19.92 13.14 18.89 12.11C18.68 11.9 18.45 11.71 18.21 11.54C19.04 10.55 19.5 9.3 19.5 8C19.5 6.54 18.92 5.14 17.89 4.11C16.86 3.08 15.46 2.5 14 2.5H6ZM14 10.5C14.66 10.5 15.3 10.24 15.77 9.77C16.24 9.3 16.5 8.66 16.5 8C16.5 7.34 16.24 6.7 15.77 6.23C15.3 5.76 14.66 5.5 14 5.5H7.5V10.5H14ZM7.5 18.5V13.5H15C15.66 13.5 16.3 13.76 16.77 14.23C17.24 14.7 17.5 15.34 17.5 16C17.5 16.66 17.24 17.3 16.77 17.77C16.3 18.24 15.66 18.5 15 18.5H7.5Z"
        fill="currentColor"
      />
    </svg>
  )
})

BoldIcon.displayName = "BoldIcon"
