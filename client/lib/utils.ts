import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes, letting later ones win.
 *
 * `clsx` handles the conditional logic; `twMerge` resolves conflicts — so a
 * component's default `px-4` is actually overridden by a caller's `px-2`,
 * instead of both landing in the class list and the outcome depending on
 * stylesheet order.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
