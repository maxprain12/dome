import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const SubscriptIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M3.29 7.29C3.68 6.9 4.32 6.9 4.71 7.29L12.71 15.29C13.1 15.68 13.1 16.32 12.71 16.71C12.32 17.1 11.68 17.1 11.29 16.71L3.29 8.71C2.9 8.32 2.9 7.68 3.29 7.29Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.71 7.29C13.1 7.68 13.1 8.32 12.71 8.71L4.71 16.71C4.32 17.1 3.68 17.1 3.29 16.71C2.9 16.32 2.9 15.68 3.29 15.29L11.29 7.29C11.68 6.9 12.32 6.9 12.71 7.29Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.41 14.4C18.03 14.05 18.75 13.92 19.45 14.04C20.16 14.16 20.8 14.51 21.27 15.05L21.28 15.06L21.28 15.06C21.74 15.6 22 16.29 22 17C22 18.08 21.4 18.84 20.77 19.34C20.19 19.81 19.49 20.14 18.98 20.38C18.96 20.39 18.95 20.4 18.93 20.4C18.45 20.63 18.28 20.78 18.19 20.92C18.18 20.94 18.16 20.97 18.15 21H21C21.55 21 22 21.45 22 22C22 22.55 21.55 23 21 23H17C16.45 23 16 22.55 16 22C16 21.17 16.12 20.44 16.51 19.83C16.91 19.22 17.49 18.87 18.07 18.6C18.63 18.33 19.14 18.09 19.52 17.78C19.88 17.49 20 17.25 20 17C20 16.77 19.92 16.55 19.77 16.37C19.6 16.18 19.37 16.05 19.12 16.01C18.87 15.97 18.62 16.02 18.39 16.14C18.18 16.26 18.02 16.45 17.94 16.68C17.76 17.2 17.19 17.47 16.67 17.28C16.14 17.1 15.87 16.53 16.06 16.01C16.3 15.33 16.78 14.76 17.4 14.4L17.41 14.4L17.41 14.4Z"
        fill="currentColor"
      />
    </svg>
  )
})

SubscriptIcon.displayName = "SubscriptIcon"
