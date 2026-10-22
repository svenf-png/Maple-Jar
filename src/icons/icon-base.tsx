import type { ReactNode } from 'react';

export interface IconProps {
  size?: number;
  className?: string | undefined;
}

interface BaseProps extends IconProps {
  strokeWidth?: number;
  children: ReactNode;
}

export function IconBase({ size = 24, className, strokeWidth = 1.9, children }: BaseProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...(className ? { className } : {})}
    >
      {children}
    </svg>
  );
}
