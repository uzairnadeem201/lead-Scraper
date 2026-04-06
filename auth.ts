import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./lib/db";
import { users } from "./lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // Find user in DB
        const [user] = await db.select().from(users).where(eq(users.username, credentials.username as string));
        
        if (!user || !user.password) return null;

        // Check password
        const isValid = await bcrypt.compare(credentials.password as string, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          username: user.username,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.username = (user as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        session.user.username = token.username as string;
      }
      return session;
    },
  },
});
