import { NextRequest, NextResponse } from 'next/server';
import {
  getModelInfo,
  getDelegate,
  sanitizeRecord,
  coerceValue,
} from '@/lib/database-explorer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ model: string; id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { model: modelName, id } = await params;
    const model = getModelInfo(modelName);
    if (!model) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Model not found' },
        { status: 404 }
      );
    }

    const delegate = getDelegate(modelName);
    if (!delegate) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Model not accessible' },
        { status: 400 }
      );
    }

    const idField = model.idField;
    const idType = model.scalarFields.find((f) => f.isId)?.type || 'String';
    const idValue = idType === 'Int' ? parseInt(id, 10) : id;

    const record = await delegate.findUnique({ where: { [idField]: idValue } });
    if (!record) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ record: sanitizeRecord(record, model), schema: model });
  } catch (error) {
    console.error('Failed to fetch record:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch record' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { model: modelName, id } = await params;
    const model = getModelInfo(modelName);
    if (!model) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Model not found' },
        { status: 404 }
      );
    }
    if (model.isProtected) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'This model is read-only' },
        { status: 403 }
      );
    }

    const delegate = getDelegate(modelName);
    if (!delegate) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Model not accessible' },
        { status: 400 }
      );
    }

    const idField = model.idField;
    const idType = model.scalarFields.find((f) => f.isId)?.type || 'String';
    const idValue = idType === 'Int' ? parseInt(id, 10) : id;

    const existing = await delegate.findUnique({ where: { [idField]: idValue } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Record not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    for (const field of model.scalarFields) {
      if (field.isId) continue;
      if (field.isReadOnly) continue;
      if (field.isSensitive) continue;
      if (field.name === 'createdAt') continue;
      if (body[field.name] !== undefined) {
        data[field.name] = coerceValue(body[field.name], field.type, field.isRequired);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'No updatable fields provided' },
        { status: 400 }
      );
    }

    const record = await delegate.update({ where: { [idField]: idValue }, data });
    return NextResponse.json({ record: sanitizeRecord(record, model) });
  } catch (error) {
    console.error('Failed to update record:', error);
    const message = error instanceof Error ? error.message : 'Failed to update record';
    return NextResponse.json(
      { error: 'Internal Server Error', message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { model: modelName, id } = await params;
    const model = getModelInfo(modelName);
    if (!model) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Model not found' },
        { status: 404 }
      );
    }
    if (model.isProtected) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'This model is read-only' },
        { status: 403 }
      );
    }

    const delegate = getDelegate(modelName);
    if (!delegate) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Model not accessible' },
        { status: 400 }
      );
    }

    const idField = model.idField;
    const idType = model.scalarFields.find((f) => f.isId)?.type || 'String';
    const idValue = idType === 'Int' ? parseInt(id, 10) : id;

    const existing = await delegate.findUnique({ where: { [idField]: idValue } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Record not found' },
        { status: 404 }
      );
    }

    await delegate.delete({ where: { [idField]: idValue } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete record:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete record';
    return NextResponse.json(
      { error: 'Internal Server Error', message },
      { status: 500 }
    );
  }
}
