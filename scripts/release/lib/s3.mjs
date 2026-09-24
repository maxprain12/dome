import { createReadStream } from 'node:fs';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export function createClient({ endpoint, region, accessKeyId, secretAccessKey }) {
  return new S3Client({
    region: region || 'auto',
    endpoint: endpoint || undefined,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function headSha512(client, bucket, key) {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return res.Metadata?.sha512 ?? '';
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return null;
    throw error;
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadFile(client, bucket, key, filePath, { sha512, contentType, cacheControl }) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentType: contentType,
          CacheControl: cacheControl,
          Metadata: { sha512 },
        },
        partSize: 16 * 1024 * 1024,
        queueSize: 4,
      });
      await upload.done();
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000 * 2 ** (attempt + 1));
    }
  }
  throw lastError;
}

export async function putText(client, bucket, key, body, { contentType, cacheControl }) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  }));
}

export async function getText(client, bucket, key) {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await res.Body.transformToString();
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NoSuchKey') return null;
    throw error;
  }
}

export async function copyViaStream(source, sourceBucket, sourceKey, dest, destBucket, destKey, headers) {
  const res = await source.send(new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey }));
  await dest.send(new PutObjectCommand({
    Bucket: destBucket,
    Key: destKey,
    Body: res.Body,
    ContentType: headers.contentType,
    CacheControl: headers.cacheControl,
  }));
}
