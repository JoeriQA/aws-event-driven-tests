import crypto from 'crypto';

export function generateHmacSignature(
  payload: string,
  hmacKey: string,
  bufferHmac: boolean,
  doubleBase64: boolean,
): string {
  let key;

  if (!hmacKey) {
    throw new Error('HMAC key not found');
  }

  if (bufferHmac) {
    key = packH(hmacKey);
  } else {
    key = hmacKey;
  }
  const data = Buffer.from(payload, 'utf8');

  try {
    const hmac = crypto.createHmac('sha256', key);
    const rawHmac = hmac.update(data).digest();
    const base64 = rawHmac.toString('base64');
    if (doubleBase64) {
      const base64_2 = Buffer.from(base64, 'utf-8');
      return Buffer.from(base64_2).toString('base64');
    } else {
      return base64;
    }
  } catch (e: any) {
    throw new Error(`Failed to generate HMAC: ${e.message}`);
  }
}

function packH(hex: string): Buffer {
  if (hex.length % 2 === 1) {
    hex += '0';
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }

  return Buffer.from(bytes);
}
