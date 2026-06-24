import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const CheckIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M20.71 5.29C21.1 5.68 21.1 6.32 20.71 6.71L9.71 17.71C9.32 18.1 8.68 18.1 8.29 17.71L3.29 12.71C2.9 12.32 2.9 11.68 3.29 11.29C3.68 10.9 4.32 10.9 4.71 11.29L9 15.59L19.29 5.29C19.68 4.9 20.32 4.9 20.71 5.29Z"
        fill="currentColor"
      />
    </svg>
  )
})

CheckIcon.displayName = "CheckIcon"
