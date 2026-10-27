import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const prefix = 'v1';
const purpose = 'animate-studio/data-credentials/v1';
function key(secret: string) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('服务端数据凭据密钥未配置。');
  return createHash('sha256').update(purpose).update('\0').update(secret).digest();
}
export function encryptDataCredential(plainText: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [prefix, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptDataCredential(payload: string, secret: string): string {
  try {
    const [version, iv, tag, encrypted] = payload.split('.');
    if (version !== prefix || !iv || !tag || !encrypted) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch { throw new Error('数据凭据无法解密，请重新创建凭据。'); }
}
