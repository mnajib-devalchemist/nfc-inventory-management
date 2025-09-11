import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and tailwind-merge for optimal Tailwind CSS class handling.
 * 
 * This utility function merges class names intelligently, resolving conflicts between
 * Tailwind CSS classes and allowing conditional class application.
 * 
 * @param inputs - Class values to be merged (strings, objects, arrays, etc.)
 * @returns Merged and deduplicated class string
 * 
 * @example Basic usage
 * ```typescript
 * cn('px-4 py-2', 'bg-blue-500', { 'text-white': true })
 * // Returns: 'px-4 py-2 bg-blue-500 text-white'
 * ```
 * 
 * @example Conflict resolution
 * ```typescript
 * cn('p-4', 'px-6') // Returns: 'p-4 px-6' (px-6 overrides px part of p-4)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}