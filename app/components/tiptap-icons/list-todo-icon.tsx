import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const ListTodoIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M2 6C2 4.9 2.9 4 4 4H8C9.1 4 10 4.9 10 6V10C10 11.1 9.1 12 8 12H4C2.9 12 2 11.1 2 10V6ZM8 6H4V10H8V6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.71 14.29C10.1 14.68 10.1 15.32 9.71 15.71L5.71 19.71C5.32 20.1 4.68 20.1 4.29 19.71L2.29 17.71C1.9 17.32 1.9 16.68 2.29 16.29C2.68 15.9 3.32 15.9 3.71 16.29L5 17.59L8.29 14.29C8.68 13.9 9.32 13.9 9.71 14.29Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 6C12 5.45 12.45 5 13 5H21C21.55 5 22 5.45 22 6C22 6.55 21.55 7 21 7H13C12.45 7 12 6.55 12 6Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 12C12 11.45 12.45 11 13 11H21C21.55 11 22 11.45 22 12C22 12.55 21.55 13 21 13H13C12.45 13 12 12.55 12 12Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 18C12 17.45 12.45 17 13 17H21C21.55 17 22 17.45 22 18C22 18.55 21.55 19 21 19H13C12.45 19 12 18.55 12 18Z"
        fill="currentColor"
      />
    </svg>
  )
})

ListTodoIcon.displayName = "ListTodoIcon"
