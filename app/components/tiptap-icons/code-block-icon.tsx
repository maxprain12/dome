import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const CodeBlockIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M6.71 2.29C7.1 2.68 7.1 3.32 6.71 3.71L4.41 6L6.71 8.29C7.1 8.68 7.1 9.32 6.71 9.71C6.32 10.1 5.68 10.1 5.29 9.71L2.29 6.71C1.9 6.32 1.9 5.68 2.29 5.29L5.29 2.29C5.68 1.9 6.32 1.9 6.71 2.29Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.29 2.29C10.68 1.9 11.32 1.9 11.71 2.29L14.71 5.29C15.1 5.68 15.1 6.32 14.71 6.71L11.71 9.71C11.32 10.1 10.68 10.1 10.29 9.71C9.9 9.32 9.9 8.68 10.29 8.29L12.59 6L10.29 3.71C9.9 3.32 9.9 2.68 10.29 2.29Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17 4C17 3.45 17.45 3 18 3H19C20.66 3 22 4.34 22 6V18C22 19.66 20.66 21 19 21H5C3.34 21 2 19.66 2 18V12C2 11.45 2.45 11 3 11C3.55 11 4 11.45 4 12V18C4 18.55 4.45 19 5 19H19C19.55 19 20 18.55 20 18V6C20 5.45 19.55 5 19 5H18C17.45 5 17 4.55 17 4Z"
        fill="currentColor"
      />
    </svg>
  )
})

CodeBlockIcon.displayName = "CodeBlockIcon"
