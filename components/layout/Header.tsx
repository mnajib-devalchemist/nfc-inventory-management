/**
 * Application Header Component
 *
 * Main navigation header with user menu and application branding.
 *
 * @component
 * @since 1.8.0
 */

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 h-16">
      <div className="flex items-center justify-between px-6 h-full">
        <Link href="/dashboard" className="text-xl font-semibold text-gray-900">
          Digital Inventory
        </Link>

        <nav className="flex items-center space-x-4">
          <Link href="/inventory">
            <Button variant="ghost">Inventory</Button>
          </Link>
          <Link href="/settings">
            <Button variant="ghost">Settings</Button>
          </Link>
          <Button variant="outline" size="sm">
            Sign Out
          </Button>
        </nav>
      </div>
    </header>
  );
}