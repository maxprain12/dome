import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const UnderlineIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M7 4C7 3.45 6.55 3 6 3C5.45 3 5 3.45 5 4V10C5 11.86 5.74 13.64 7.05 14.95C8.36 16.26 10.14 17 12 17C13.86 17 15.64 16.26 16.95 14.95C18.26 13.64 19 11.86 19 10V4C19 3.45 18.55 3 18 3C17.45 3 17 3.45 17 4V10C17 11.33 16.47 12.6 15.54 13.54C14.6 14.47 13.33 15 12 15C10.67 15 9.4 14.47 8.46 13.54C7.53 12.6 7 11.33 7 10V4ZM4 19C3.45 19 3 19.45 3 20C3 20.55 3.45 21 4 21H20C20.55 21 21 20.55 21 20C21 19.45 20.55 19 20 19H4Z"
        fill="currentColor"
      />
    </svg>
  )
})

UnderlineIcon.displayName = "UnderlineIcon"
