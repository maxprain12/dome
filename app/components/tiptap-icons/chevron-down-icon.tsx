import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const ChevronDownIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M5.29 8.29C5.68 7.9 6.32 7.9 6.71 8.29L12 13.59L17.29 8.29C17.68 7.9 18.32 7.9 18.71 8.29C19.1 8.68 19.1 9.32 18.71 9.71L12.71 15.71C12.32 16.1 11.68 16.1 11.29 15.71L5.29 9.71C4.9 9.32 4.9 8.68 5.29 8.29Z"
        fill="currentColor"
      />
    </svg>
  )
})

ChevronDownIcon.displayName = "ChevronDownIcon"
