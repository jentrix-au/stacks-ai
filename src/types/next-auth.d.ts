import "next-auth";
import "next-auth/adapters";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** Instance admin (first user on a self-hosted deployment). */
      isAdmin: boolean;
    };
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    /** Instance admin flag, mirrored from the `User.isAdmin` column. */
    isAdmin?: boolean;
  }
}
