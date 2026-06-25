import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const BanIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M4.43 4.01C4.35 4.06 4.27 4.12 4.19 4.19C4.12 4.27 4.06 4.35 4.01 4.43C2.15 6.41 1 9.07 1 12C1 18.08 5.92 23 12 23C14.93 23 17.59 21.85 19.57 19.99C19.65 19.94 19.73 19.88 19.81 19.81C19.88 19.73 19.94 19.65 19.99 19.57C21.85 17.59 23 14.93 23 12C23 5.92 18.08 1 12 1C9.07 1 6.41 2.15 4.43 4.01ZM6.38 4.97C7.92 3.74 9.87 3 12 3C16.97 3 21 7.03 21 12C21 14.13 20.26 16.08 19.03 17.62L6.38 4.97ZM17.62 19.03C16.08 20.26 14.13 21 12 21C7.03 21 3 16.97 3 12C3 9.87 3.74 7.92 4.97 6.38L17.62 19.03Z"
        fill="currentColor"
      />
    </svg>
  )
})

BanIcon.displayName = "BanIcon"
