import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </div>
      
      <div className="rounded-md bg-yellow-50 p-4">
        <div className="text-sm text-yellow-700">
          <p>🚧 Authentication system is being set up. This page will be completed soon.</p>
        </div>
      </div>

      <div className="text-center">
        <Link 
          href="/dashboard" 
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Continue to Dashboard (Demo)
        </Link>
      </div>
    </div>
  );
}