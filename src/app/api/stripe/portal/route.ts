import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createPortalSession } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user?.team?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found' },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const portalSession = await createPortalSession(
      user.team.stripeCustomerId,
      `${baseUrl}/dashboard/billing`
    );

    return NextResponse.json({
      url: portalSession.url,
    });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
