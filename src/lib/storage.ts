import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateStreamToken } from './crypto';

export interface StorageDriver {
  saveFile(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  getFileStream(key: string): Promise<ReadableStream | NodeJS.ReadableStream | Buffer>;
  generatePresignedDownloadUrl(
    key: string,
    documentId: string,
    userId: string,
    filename: string,
    expiresInSeconds?: number
  ): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

/**
 * Local private disk storage driver for secure development & offline evaluation.
 * Stores files in an unexposed folder and issues HMAC-signed short-lived (max 60s) streaming URLs.
 */
class LocalStorageDriver implements StorageDriver {
  private baseDir: string;
  private jwtSecret: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_PATH || 'vault_storage');
    this.jwtSecret = process.env.JWT_SECRET || 'trustvault-secret-key-storage-fallback-32chars';
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async saveFile(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const safeKey = path.basename(key);
    const dest = path.join(this.baseDir, safeKey);
    await fs.promises.writeFile(dest, buffer);
    return safeKey;
  }

  async getFileStream(key: string): Promise<Buffer> {
    const safeKey = path.basename(key);
    const filePath = path.join(this.baseDir, safeKey);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Vault storage object not found: ${safeKey}`);
    }
    return fs.promises.readFile(filePath);
  }

  async generatePresignedDownloadUrl(
    key: string,
    documentId: string,
    userId: string,
    filename: string,
    expiresInSeconds: number = 60
  ): Promise<string> {
    // Strictly cap expiration at 60 seconds per Rule Three
    const validDuration = Math.min(expiresInSeconds, 60);
    const { token } = generateStreamToken(documentId, userId, this.jwtSecret, validDuration);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const safeFilename = encodeURIComponent(filename);
    return `${appUrl}/api/documents/stream?docId=${documentId}&token=${token}&filename=${safeFilename}`;
  }

  async deleteFile(key: string): Promise<void> {
    const safeKey = path.basename(key);
    const filePath = path.join(this.baseDir, safeKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

/**
 * Cloudflare R2 / AWS S3 Storage Driver.
 * Connects to private bucket and generates standard AWS S3 presigned URLs valid for max 60s.
 */
class S3StorageDriver implements StorageDriver {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET_NAME || 'trustvault-private-bucket';
    this.s3 = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
    });
  }

  async saveFile(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256',
    });
    await this.s3.send(command);
    return key;
  }

  async getFileStream(key: string): Promise<any> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.s3.send(command);
    return response.Body;
  }

  async generatePresignedDownloadUrl(
    key: string,
    _documentId: string,
    _userId: string,
    filename: string,
    expiresInSeconds: number = 60
  ): Promise<string> {
    // Strictly cap at max 60 seconds
    const validDuration = Math.min(expiresInSeconds, 60);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
    return getSignedUrl(this.s3, command, { expiresIn: validDuration });
  }

  async deleteFile(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}

// Select driver based on configuration
export function getStorageDriver(): StorageDriver {
  if (
    process.env.STORAGE_DRIVER === 's3' &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  ) {
    return new S3StorageDriver();
  }
  return new LocalStorageDriver();
}
