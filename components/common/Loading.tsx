/**
 * Loading Component
 *
 * Displays loading spinner with optional message.
 *
 * @component
 * @since 1.8.0
 */

export function Loading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <p className="mt-4 text-sm text-gray-600">{message}</p>
    </div>
  );
}