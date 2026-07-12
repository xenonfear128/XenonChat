import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import path from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private client: S3Client | null = null;
  private bucket: string;
  private useLocalFallback = false;
  private localRoot: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get('OBJECT_STORAGE_BUCKET', 'xenonchat');
    this.localRoot = path.resolve(process.cwd(), '.uploads');
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
      const full = path.join(this.localRoot, key);
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
      return `/api/media/local/${encodeURIComponent(key)}`;
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
        uploadUrl: `/api/media/local-upload/${encodeURIComponent(key)}`,
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
        await unlink(path.join(this.localRoot, key));
      } catch {
        /* ignore */
      }
      return;
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async readLocal(key: string) {
    return readFile(path.join(this.localRoot, key));
  }

  getBucket() {
    return this.bucket;
  }
}
