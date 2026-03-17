'use client';

import { cn } from '@/lib/utils';

interface HorusEyeIconProps {
  /** Container size class. Defaults to h-7 w-7 */
  className?: string;
  /** SVG fill class inside the container. Defaults to text-primary-foreground */
  iconClassName?: string;
}

/**
 * HorusEye brand icon rendered as an inline SVG.
 * Wrap it in a coloured container to match the brand style:
 *   <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
 *     <HorusEyeIcon />
 *   </div>
 */
export function HorusEyeIcon({ className, iconClassName }: HorusEyeIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 143.27 125.76"
      className={cn('fill-current', className)}
      aria-hidden="true"
    >
      <path
        className={iconClassName}
        d="M104.69,96.11l38.51,15.88-5.49,13.78L.17,69.82l-.17-13.91L137.41,0l5.86,13.65-38.77,15.92c12.14,7.73,18.83,19.48,18.97,32.56s-5.81,25.09-18.77,33.98ZM80.32,40.13c-13.44,3.07-20.65,16-17.58,28.42s15.31,19.55,27.12,17.11c12.87-2.65,20.86-14.95,18.3-27.47s-14.57-21.09-27.85-18.06ZM48.1,73.24c-.95-7.96-.77-13.6-.19-20.79l-24.9,10.44,25.09,10.35Z"
      />
    </svg>
  );
}
