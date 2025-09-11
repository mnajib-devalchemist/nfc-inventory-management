import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      householdId: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    provider?: string;
  }

  interface User {
    id: string;
    defaultHouseholdId?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    householdId: string;
    provider?: string;
  }
}