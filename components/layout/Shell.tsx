/**
 * Main Application Shell Component
 *
 * Provides the root layout structure for the dashboard with
 * consistent theming and responsive design.
 *
 * @component
 * @since 1.8.0
 */

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}