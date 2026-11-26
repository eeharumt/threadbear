import { LINE, type LineName } from './line-icons';

/** One of the Android app's thin line icons, tinted by the text colour around it. */
export function Icon({ name, size = 22, label, className }: { name: LineName; size?: number; label?: string; className?: string }) {
  const { paths, fill } = LINE[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
