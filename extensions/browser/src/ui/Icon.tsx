export type IconName =
  | 'capture'
  | 'note'
  | 'contact'
  | 'close'
  | 'arrow'
  | 'check'
  | 'sun'
  | 'moon'
  | 'plus'
  | 'link';
const paths: Record<IconName, string> = {
  capture: 'M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5',
  note: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6',
  contact: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  check: 'm5 12 4 4L19 6',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z',
  plus: 'M12 5v14M5 12h14',
  link: 'm10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l3-3a4 4 0 0 1 6 0m4 2 1-1a4 4 0 0 0-6-6l-3 3a4 4 0 0 0 0 6',
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
