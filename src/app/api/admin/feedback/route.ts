import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [ideas, total] = await Promise.all([
      prisma.idea.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: { name: true, email: true },
          },
          _count: {
            select: { votes: true },
          },
        },
      }),
      prisma.idea.count({ where }),
    ]);

    return NextResponse.json({
      ideas: ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        description: idea.description,
        category: idea.category,
        status: idea.status,
        authorName: idea.author.name,
        authorEmail: idea.author.email,
        voteCount: idea._count.votes,
        createdAt: idea.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch feedback:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}
