/**
 * Dashboard Sidebar Component
 *
 * Navigation sidebar with main application sections and quick actions.
 *
 * @component
 * @since 1.8.0
 */

'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Inventory', href: '/inventory', icon: '📦' },
  { name: 'Add Item', href: '/inventory/new', icon: '➕' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200">
      <nav className="p-4 space-y-2">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center px-3 py-2 text-sm font-medium rounded-md',
              'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
          >
            <span className="mr-3">{item.icon}</span>
            {item.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
}