import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const SuperscriptIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M12.71 7.29C13.1 7.68 13.1 8.32 12.71 8.71L4.71 16.71C4.32 17.1 3.68 17.1 3.29 16.71C2.9 16.32 2.9 15.68 3.29 15.29L11.29 7.29C11.68 6.9 12.32 6.9 12.71 7.29Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.29 7.29C3.68 6.9 4.32 6.9 4.71 7.29L12.71 15.29C13.1 15.68 13.1 16.32 12.71 16.71C12.32 17.1 11.68 17.1 11.29 16.71L3.29 8.71C2.9 8.32 2.9 7.68 3.29 7.29Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.41 1.41C18.02 1.05 18.75 0.93 19.45 1.04C20.15 1.16 20.79 1.52 21.27 2.05L21.27 2.05L21.27 2.05C21.74 2.6 22 3.29 22 4C22 5.09 21.4 5.84 20.77 6.34C20.2 6.81 19.49 7.14 18.99 7.37C18.97 7.38 18.95 7.39 18.93 7.4C18.45 7.63 18.28 7.78 18.19 7.92C18.18 7.94 18.16 7.97 18.15 8H21C21.55 8 22 8.45 22 9C22 9.55 21.55 10 21 10H17C16.45 10 16 9.55 16 9C16 8.17 16.12 7.44 16.51 6.83C16.91 6.22 17.49 5.87 18.07 5.6C18.63 5.33 19.14 5.09 19.52 4.78C19.88 4.49 20 4.25 20 4C20 3.77 19.92 3.55 19.76 3.37C19.6 3.18 19.37 3.06 19.12 3.02C18.87 2.97 18.61 3.02 18.39 3.15C18.18 3.27 18.02 3.46 17.94 3.68C17.75 4.2 17.18 4.46 16.66 4.28C16.14 4.09 15.87 3.52 16.06 3C16.3 2.32 16.78 1.76 17.4 1.41L17.41 1.41Z"
        fill="currentColor"
      />
    </svg>
  )
})

SuperscriptIcon.displayName = "SuperscriptIcon"
