import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const HeadingThreeIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M4 5C4.55 5 5 5.45 5 6V11H11V6C11 5.45 11.45 5 12 5C12.55 5 13 5.45 13 6V18C13 18.55 12.55 19 12 19C11.45 19 11 18.55 11 18V13H5V18C5 18.55 4.55 19 4 19C3.45 19 3 18.55 3 18V6C3 5.45 3.45 5 4 5Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.46 11.22C19.11 11.05 18.59 11.02 18.01 11.36C17.53 11.64 16.92 11.48 16.64 11.01C16.36 10.53 16.52 9.92 16.99 9.64C18.11 8.98 19.34 8.95 20.31 9.41C21.28 9.87 22 10.82 22 12C22 12.8 21.68 13.56 21.12 14.12C20.56 14.68 19.8 15 19 15C18.45 15 18 14.55 18 14C18 13.45 18.45 13 19 13C19.27 13 19.52 12.89 19.71 12.71C19.89 12.52 20 12.27 20 12C20 11.68 19.82 11.38 19.46 11.22Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18 14C18 13.45 18.45 13 19 13C19.8 13 20.56 13.32 21.12 13.88C21.68 14.44 22 15.2 22 16C22 17.29 21.28 18.4 20.16 18.9C19.03 19.41 17.64 19.23 16.4 18.3C15.96 17.97 15.87 17.34 16.2 16.9C16.53 16.46 17.16 16.37 17.6 16.7C18.36 17.27 18.97 17.24 19.34 17.08C19.72 16.9 20 16.51 20 16C20 15.73 19.89 15.48 19.71 15.29C19.52 15.11 19.27 15 19 15C18.45 15 18 14.55 18 14Z"
        fill="currentColor"
      />
    </svg>
  )
})

HeadingThreeIcon.displayName = "HeadingThreeIcon"
