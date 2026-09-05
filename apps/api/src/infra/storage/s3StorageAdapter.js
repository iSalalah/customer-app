import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { logger } from '../logger.js';

/**
 * Production adapter for any S3-compatible object store. Objects are private;
 * no pre-signed URL is ever issued, because every download must pass through
 * the authorising controller (see docs/07-security.md, T6).
 */

const KEY_PATTERN = /^[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

export function createS3StorageAdapter({ endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle }) {
  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(forcePathStyle),
    credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined,
  });

  function assertKey(key) {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new Error('invalid storage key');
    }
    return key;
  }

  return {
    name: 'S3',

    async init() {
      logger.info({ bucket, region }, 's3 storage adapter ready');
    },

    async put(key, buffer, contentType) {
      assertKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ServerSideEncryption: 'AES256',
        }),
      );
      return { key, provider: 'S3' };
    },

    async createReadStream(key) {
      assertKey(key);
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return result.Body;
    },

    async remove(key) {
      try {
        assertKey(key);
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        logger.warn({ key, err: { message: error.message } }, 'failed to remove stored object');
      }
    },

    async exists(key) {
      try {
        assertKey(key);
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
