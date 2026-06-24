import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const Code2Icon = memo(({ className, ...props }: SvgProps) => {
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
        d="M15.45 4.3C15.62 3.77 15.33 3.21 14.8 3.05C14.27 2.88 13.71 3.17 13.55 3.7L8.55 19.7C8.38 20.23 8.67 20.79 9.2 20.95C9.73 21.12 10.29 20.83 10.45 20.3L15.45 4.3Z"
        fill="currentColor"
      />
      <path
        d="M6.71 7.29C7.1 7.68 7.1 8.32 6.71 8.71L3.41 12L6.71 15.29C7.1 15.68 7.1 16.32 6.71 16.71C6.32 17.1 5.68 17.1 5.29 16.71L1.29 12.71C0.9 12.32 0.9 11.68 1.29 11.29L5.29 7.29C5.68 6.9 6.32 6.9 6.71 7.29Z"
        fill="currentColor"
      />
      <path
        d="M17.29 7.29C17.68 6.9 18.32 6.9 18.71 7.29L22.71 11.29C23.1 11.68 23.1 12.32 22.71 12.71L18.71 16.71C18.32 17.1 17.68 17.1 17.29 16.71C16.9 16.32 16.9 15.68 17.29 15.29L20.59 12L17.29 8.71C16.9 8.32 16.9 7.68 17.29 7.29Z"
        fill="currentColor"
      />
    </svg>
  )
})

Code2Icon.displayName = "Code2Icon"
