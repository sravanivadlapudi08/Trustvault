import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { validateFileMagicBytes } from '@/lib/crypto';
import { getStorageDriver } from '@/lib/storage';
import { createAuditLogEntry } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Role Enforcement: Only owners and admins can upload documents
    if (user.role !== 'owner' && user.role !== 'admin') {
      await createAuditLogEntry({
        actorId: user.id,
        action: 'UNAUTHORIZED_UPLOAD_ATTEMPT_BLOCKED',
        targetId: 'UPLOAD_ENDPOINT',
        ipAddress: ip,
        status: 'BLOCKED',
        metadata: { attemptedRole: user.role, reason: 'Viewers cannot upload documents' },
      });
      return NextResponse.json(
        { error: 'Forbidden: Your role does not have permission to upload documents.' },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string)?.trim();
    const category = (formData.get('category') as string)?.trim() || 'General';

    if (!file) {
      return NextResponse.json({ error: 'No file was provided in the upload request.' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Document title is required.' }, { status: 400 });
    }

    // Read file bytes into memory buffer for strict validation
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Deep server-side validation: size limits, extension whitelisting, and magic byte sniffing
    const validation = validateFileMagicBytes(buffer, file.name, file.type);
    if (!validation.isValid) {
      await createAuditLogEntry({
        actorId: user.id,
        action: 'FILE_VALIDATION_FAILED',
        targetId: file.name,
        ipAddress: ip,
        status: 'BLOCKED',
        metadata: {
          filename: file.name,
          reportedType: file.type,
          fileSize: buffer.length,
          rejectionReason: validation.error,
        },
      });

      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Generate secure randomized storage object key (no user-controlled paths)
    const ext = path.extname(file.name).toLowerCase();
    const safeKey = `doc_${crypto.randomUUID()}${ext}`;

    // Stream and persist file into private object storage
    const storageDriver = getStorageDriver();
    await storageDriver.saveFile(safeKey, buffer, validation.detectedMime);

    // Create document record in database
    const document = await prisma.document.create({
      data: {
        title,
        filePath: safeKey,
        fileSize: buffer.length,
        mimeType: validation.detectedMime,
        category,
        ownerId: user.id,
      },
    });

    // Indelibly record upload in hash-chained audit trail
    await createAuditLogEntry({
      actorId: user.id,
      action: 'DOCUMENT_UPLOAD',
      targetId: document.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: {
        title: document.title,
        category: document.category,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        originalFilename: file.name,
      },
    });

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal error during document upload: ' + error.message },
      { status: 500 }
    );
  }
}
