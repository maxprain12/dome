import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const ExternalLinkIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M14 3C14 2.45 14.45 2 15 2H21C21.55 2 22 2.45 22 3V9C22 9.55 21.55 10 21 10C20.45 10 20 9.55 20 9V5.41L10.71 14.71C10.32 15.1 9.68 15.1 9.29 14.71C8.9 14.32 8.9 13.68 9.29 13.29L18.59 4H15C14.45 4 14 3.55 14 3Z"
        fill="currentColor"
      />
      <path
        d="M4.29 7.29C4.48 7.11 4.73 7 5 7H11C11.55 7 12 6.55 12 6C12 5.45 11.55 5 11 5H5C4.2 5 3.44 5.32 2.88 5.88C2.32 6.44 2 7.2 2 8V19C2 19.8 2.32 20.56 2.88 21.12C3.44 21.68 4.2 22 5 22H16C16.8 22 17.56 21.68 18.12 21.12C18.68 20.56 19 19.8 19 19V13C19 12.45 18.55 12 18 12C17.45 12 17 12.45 17 13V19C17 19.27 16.89 19.52 16.71 19.71C16.52 19.89 16.27 20 16 20H5C4.73 20 4.48 19.89 4.29 19.71C4.11 19.52 4 19.27 4 19V8C4 7.73 4.11 7.48 4.29 7.29Z"
        fill="currentColor"
      />
    </svg>
  )
})

ExternalLinkIcon.displayName = "ExternalLinkIcon"
