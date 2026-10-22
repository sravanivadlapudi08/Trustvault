import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, SecurityException } from '@/lib/auth';
import { suggestDocumentAccess, confirmAiSuggestion } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required.' }, { status: 400 });
    }

    // Generate safe AI suggestions. Audit trail logged automatically.
    const suggestions = await suggestDocumentAccess(user, documentId, ip);

    return NextResponse.json({
      success: true,
      suggestions,
      disclaimer: 'AI recommendations require explicit human owner confirmation. No access has been granted.',
    });
  } catch (error: any) {
    if (error instanceof SecurityException) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: 'Error generating AI suggestions: ' + error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const { documentId, targetUserId, canRead = true, canEdit = false, rationale = '' } = body;

    if (!documentId || !targetUserId) {
      return NextResponse.json({ error: 'documentId and targetUserId are required.' }, { status: 400 });
    }

    // Explicit human owner confirmation. Logs AI_PERMISSION_CONFIRMED_BY_HUMAN.
    const permission = await confirmAiSuggestion(
      user,
      documentId,
      targetUserId,
      Boolean(canRead),
      Boolean(canEdit),
      rationale,
      ip
    );

    return NextResponse.json({
      success: true,
      message: 'AI suggestion confirmed and granted by human owner.',
      permission,
    });
  } catch (error: any) {
    if (error instanceof SecurityException) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: 'Error confirming AI suggestion: ' + error.message },
      { status: 500 }
    );
  }
}
