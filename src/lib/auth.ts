import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Apple from 'next-auth/providers/apple';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const { handlers, signIn, signOut, auth } = NextAuth({
  // @ts-expect-error — known type mismatch between @auth/prisma-adapter@2 and next-auth@5.0.0-beta.4
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        twoFactorCode: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const twoFactorCode = credentials.twoFactorCode as string | undefined;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { team: true },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
          return null;
        }

        // Check if 2FA is enabled
        if (user.twoFactorEnabled) {
          // If no 2FA code provided, throw specific error
          if (!twoFactorCode) {
            throw new Error('2FA_REQUIRED:' + user.id);
          }

          // Verify 2FA code using otpauth
          const OTPAuth = await import('otpauth');
          const totp = new OTPAuth.TOTP({
            issuer: 'DeepTerm',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: user.twoFactorSecret!,
          });
          const delta = totp.validate({ token: twoFactorCode, window: 1 });
          const isValidToken = delta !== null;

          if (!isValidToken) {
            // Check backup codes
            if (user.twoFactorBackupCodes) {
              const crypto = await import('crypto');
              const hashedCodes = JSON.parse(user.twoFactorBackupCodes) as string[];
              const inputHash = crypto.createHash('sha256').update(twoFactorCode.toUpperCase()).digest('hex');
              const index = hashedCodes.indexOf(inputHash);

              if (index !== -1) {
                // Valid backup code - remove it
                const remainingCodes = hashedCodes.filter((_, i) => i !== index);
                await prisma.user.update({
                  where: { id: user.id },
                  data: { twoFactorBackupCodes: JSON.stringify(remainingCodes) },
                });
              } else {
                throw new Error('INVALID_2FA_CODE');
              }
            } else {
              throw new Error('INVALID_2FA_CODE');
            }
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          teamId: user.teamId,
          teamName: user.team?.name,
        };
      },
    }),
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    Apple({
      clientId: process.env.APPLE_ID!,
      clientSecret: process.env.APPLE_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Relative URLs — standard behaviour
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Same-origin URLs
      if (new URL(url).origin === baseUrl) {
        const path = new URL(url).pathname;
        // Apple uses response_mode=form_post which is a cross-site POST.
        // SameSite=Lax prevents the callbackUrl cookie from being sent,
        // so NextAuth falls back to the base URL. Redirect to /dashboard instead.
        if (path === '/' || path === '') return `${baseUrl}/dashboard`;
        return url;
      }
      return baseUrl;
    },
    async signIn({ user, account }) {
      // For OAuth sign-ins, set a name fallback if the provider didn't supply one
      if (
        (account?.provider === 'github' || account?.provider === 'apple') &&
        user.id &&
        !user.name
      ) {
        const fallback = (user.email ?? '').split('@')[0];
        await prisma.user.update({ where: { id: user.id }, data: { name: fallback } });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? 'member';
        token.teamId = user.teamId ?? null;
        token.teamName = user.teamName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.teamId = token.teamId as string | null;
        session.user.teamName = token.teamName as string | undefined;
      }
      return session;
    },
  },
});

// Type augmentation for NextAuth
declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
    teamId: string | null;
    teamName?: string;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      teamId: string | null;
      teamName?: string;
    };
  }

  interface JWT {
    id: string;
    role: string;
    teamId: string | null;
    teamName?: string;
  }
}
