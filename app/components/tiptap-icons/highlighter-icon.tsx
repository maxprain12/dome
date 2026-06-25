import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HighlighterIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M14.71 4.71C15.1 4.32 15.1 3.68 14.71 3.29C14.32 2.9 13.68 2.9 13.29 3.29L8.69 7.89L8.69 7.9C8.14 8.46 7.83 9.21 7.83 10C7.83 10.23 7.85 10.46 7.91 10.68L2.29 16.29C2.11 16.48 2 16.73 2 17V20C2 20.55 2.45 21 3 21H12C12.27 21 12.52 20.89 12.71 20.71L15.32 18.09C15.54 18.15 15.77 18.17 16 18.17C16.79 18.17 17.54 17.86 18.1 17.31L22.71 12.71C23.1 12.32 23.1 11.68 22.71 11.29C22.32 10.9 21.68 10.9 21.29 11.29L16.7 15.89C16.51 16.07 16.26 16.17 16 16.17C15.74 16.17 15.49 16.07 15.3 15.89L10.11 10.7C9.93 10.51 9.83 10.26 9.83 10C9.83 9.74 9.93 9.49 10.11 9.3L14.71 4.71ZM13.59 17L9 12.41L4 17.41V19H11.59L13.59 17Z"
        fill="currentColor"
      />
    </svg>
  )
})

HighlighterIcon.displayName = "HighlighterIcon"
