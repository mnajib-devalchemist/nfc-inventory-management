import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          Digital Inventory Manager
        </h1>
        <p className="mb-8 text-lg leading-8 text-gray-600">
          NFC-Enabled Digital Inventory Management System. Organize, track, and manage your belongings with smart technology.
        </p>
        <div className="flex items-center justify-center gap-x-6">
          <Link
            href="/login"
            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Get started
          </Link>
          <Link href="/dashboard" className="text-sm font-semibold leading-6 text-gray-900">
            Dashboard <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}