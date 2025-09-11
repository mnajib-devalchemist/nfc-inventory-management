'use client';

/**
 * SessionProvider - NextAuth.js session provider wrapper component.
 * 
 * Wraps the application with NextAuth.js SessionProvider to enable
 * session management throughout the component tree. Provides session
 * data to child components via React context.
 * 
 * @component
 * @category Authentication Components
 * @since 1.0.0
 */

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { Session } from 'next-auth';

/**
 * Props for the SessionProvider component.
 */
interface SessionProviderProps {
  /** Child components that will have access to session data */
  children: React.ReactNode;
  /** Initial session data from server-side rendering */
  session?: Session | null;
}

/**
 * SessionProvider component that wraps the app with NextAuth.js session context.
 * 
 * This component should be placed at the root of your application to provide
 * session data to all child components. It enables the use of useSession hook
 * and other NextAuth.js client-side features.
 * 
 * @param props - Component properties
 * @returns JSX element wrapping children with session provider
 * 
 * @example Basic usage in layout
 * ```tsx
 * import { SessionProvider } from '@/components/common/SessionProvider';
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <SessionProvider>
 *           {children}
 *         </SessionProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function SessionProvider({ children, session }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider session={session} refetchInterval={5 * 60}>
      {children}
    </NextAuthSessionProvider>
  );
}