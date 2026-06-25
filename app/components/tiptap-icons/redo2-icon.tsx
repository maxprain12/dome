import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const Redo2Icon = memo(({ className, ...props }: SvgProps) => {
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
        d="M15.71 2.29C15.32 1.9 14.68 1.9 14.29 2.29C13.9 2.68 13.9 3.32 14.29 3.71L17.59 7H9.5C7.78 7 6.12 7.68 4.9 8.9C3.68 10.12 3 11.78 3 13.5C3 14.35 3.17 15.2 3.49 15.99C3.82 16.78 4.3 17.49 4.9 18.1C6.12 19.32 7.78 20 9.5 20H13C13.55 20 14 19.55 14 19C14 18.45 13.55 18 13 18H9.5C8.31 18 7.16 17.53 6.32 16.68C5.9 16.26 5.57 15.77 5.34 15.22C5.12 14.68 5 14.09 5 13.5C5 12.31 5.47 11.16 6.32 10.32C7.16 9.47 8.31 9 9.5 9H17.59L14.29 12.29C13.9 12.68 13.9 13.32 14.29 13.71C14.68 14.1 15.32 14.1 15.71 13.71L20.71 8.71C21.1 8.32 21.1 7.68 20.71 7.29L15.71 2.29Z"
        fill="currentColor"
      />
    </svg>
  )
})

Redo2Icon.displayName = "Redo2Icon"
