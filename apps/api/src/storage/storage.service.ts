import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, writeFile, readFile, stat, unlink } from 'fs/promises';
import path from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private client: S3Client | null = null;
  private bucket: string;
  private useLocalFallback = false;
  private localRoot: string;
  private readonly localSigningSecret: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get('OBJECT_STORAGE_BUCKET', 'xenonchat');
    this.localRoot = path.resolve(process.cwd(), '.uploads');
    this.localSigningSecret = config.get(
      'LOCAL_STORAGE_SIGNING_SECRET',
      config.get('JWT_SECRET', 'development-local-storage-secret'),
    );
  }

  async onModuleInit() {
    const endpoint = this.config.get<string>('OBJECT_STORAGE_ENDPOINT');
    try {
      this.client = new S3Client({
        region: this.config.get('OBJECT_STORAGE_REGION', 'us-east-1'),
        endpoint,
        forcePathStyle: this.config.get('OBJECT_STORAGE_FORCE_PATH_STYLE', 'true') === 'true',
        credentials: {
          accessKeyId: this.config.get('OBJECT_STORAGE_ACCESS_KEY', 'minioadmin'),
          secretAccessKey: this.config.get('OBJECT_STORAGE_SECRET_KEY', 'minioadmin'),
        },
      });
      await this.ensureBucket();
    } catch {
      this.useLocalFallback = true;
      await mkdir(this.localRoot, { recursive: true });
      // eslint-disable-next-line no-console
      console.warn('Object storage unavailable; using local .uploads fallback');
    }
  }

  private async ensureBucket() {
    if (!this.client) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch {
        this.useLocalFallback = true;
        await mkdir(this.localRoot, { recursive: true });
      }
    }
  }

  buildKey(folder: string, ext: string) {
    return `${folder}/${randomUUID()}${ext ? `.${ext.replace(/^\./, '')}` : ''}`;
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    if (this.useLocalFallback || !this.client) {
      const full = this.resolveLocalPath(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getSignedDownloadUrl(key: string, expiresIn = 600) {
    if (this.useLocalFallback || !this.client) {
      return `/api/media/local/${this.signLocalToken(key, 'read', expiresIn)}`;
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async getSignedUploadUrl(key: string, contentType: string, expiresIn = 600) {
    if (this.useLocalFallback || !this.client) {
      return {
        uploadUrl: `/api/media/local-upload/${this.signLocalToken(key, 'write', expiresIn)}`,
        key,
        local: true,
      };
    }
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );
    return { uploadUrl, key, local: false };
  }

  async deleteObject(key: string) {
    if (this.useLocalFallback || !this.client) {
      try {
        await unlink(this.resolveLocalPath(key));
      } catch {
        /* ignore */
      }
      return;
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getObjectSize(key: string) {
    if (this.useLocalFallback || !this.client) {
      const info = await stat(this.resolveLocalPath(key));
      return info.size;
    }
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return result.ContentLength ?? 0;
  }

  async readLocal(key: string) {
    return readFile(this.resolveLocalPath(key));
  }

  verifyLocalToken(token: string, operation: 'read' | 'write') {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) throw new Error('Invalid storage token');
    const expected = createHmac('sha256', this.localSigningSecret)
      .update(payload)
      .digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new Error('Invalid storage token');
    }
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { key?: string; operation?: string; expiresAt?: number };
    if (
      !value.key ||
      value.operation !== operation ||
      !value.expiresAt ||
      value.expiresAt < Date.now()
    ) {
      throw new Error('Expired storage token');
    }
    this.resolveLocalPath(value.key);
    return value.key;
  }

  private signLocalToken(
    key: string,
    operation: 'read' | 'write',
    expiresIn: number,
  ) {
    this.resolveLocalPath(key);
    const payload = Buffer.from(
      JSON.stringify({
        key,
        operation,
        expiresAt: Date.now() + expiresIn * 1000,
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', this.localSigningSecret)
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private resolveLocalPath(key: string) {
    const fullPath = path.resolve(this.localRoot, key);
    const rootPrefix = `${this.localRoot}${path.sep}`;
    if (!fullPath.startsWith(rootPrefix)) {
      throw new Error('Invalid storage path');
    }
    return fullPath;
  }

  getBucket() {
    return this.bucket;
  }
}
