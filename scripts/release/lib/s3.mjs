import { readFile, writeFile } from 'node:fs/promises';
import { AwsClient } from 'aws4fetch';

export function createClient({ endpoint, region, accessKeyId, secretAccessKey }) {
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    aws: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: region || 'auto',
    }),
  };
}

function objectUrl(client, bucket, key) {
  const encoded = key.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${client.endpoint}/${bucket}/${encoded}`;
}

async function signed(client, bucket, key, init) {
  return client.aws.fetch(objectUrl(client, bucket, key), init);
}

export async function headSha512(client, bucket, key) {
  const res = await signed(client, bucket, key, { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HEAD ${key} respondió ${res.status}`);
  return res.headers.get('x-amz-meta-sha512') ?? '';
}

export async function uploadFile(client, bucket, key, filePath, { sha512, contentType, cacheControl }) {
  const body = await readFile(filePath);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await signed(client, bucket, key, {
      method: 'PUT',
      body,
      headers: {
        'content-type': contentType || 'application/octet-stream',
        'cache-control': cacheControl || 'public, max-age=31536000, immutable',
        'x-amz-meta-sha512': sha512,
      },
    });
    if (res.ok) return;
    lastError = new Error(`PUT ${key} respondió ${res.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt + 1)));
  }
  throw lastError;
}

export async function putText(client, bucket, key, body, { contentType, cacheControl }) {
  const res = await signed(client, bucket, key, {
    method: 'PUT',
    body,
    headers: {
      'content-type': contentType || 'text/plain',
      'cache-control': cacheControl || 'public, max-age=60',
    },
  });
  if (!res.ok) throw new Error(`PUT ${key} respondió ${res.status}`);
}

export async function getText(client, bucket, key) {
  const res = await signed(client, bucket, key, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${key} respondió ${res.status}`);
  return res.text();
}

export async function downloadFile(client, bucket, key, destPath) {
  const res = await signed(client, bucket, key, { method: 'GET' });
  if (!res.ok) throw new Error(`GET ${key} respondió ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, bytes);
}

export async function copyViaStream(source, sourceBucket, sourceKey, dest, destBucket, destKey, headers) {
  const res = await signed(source, sourceBucket, sourceKey, { method: 'GET' });
  if (!res.ok) throw new Error(`GET ${sourceKey} respondió ${res.status}`);
  const put = await signed(dest, destBucket, destKey, {
    method: 'PUT',
    body: Buffer.from(await res.arrayBuffer()),
    headers: {
      'cache-control': headers.cacheControl || 'public, max-age=31536000, immutable',
      ...(headers.contentType ? { 'content-type': headers.contentType } : {}),
    },
  });
  if (!put.ok) throw new Error(`PUT ${destKey} respondió ${put.status}`);
}
