function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function deriveKey(raw: string): Promise<CryptoKey> {
  const keyData = /^[0-9a-fA-F]{64}$/.test(raw)
    ? fromHex(raw)
    : new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// 统一线格式（与 backend 对齐）：ivHex:encHex，其中 enc = ciphertext + GCM tag（内联），IV 12 字节。
export async function encrypt(text: string, encryptionKey: string): Promise<string> {
  const key = await deriveKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${toHex(iv)}:${toHex(encrypted)}`;
}

export async function decrypt(encryptedText: string, encryptionKey: string): Promise<string> {
  const key = await deriveKey(encryptionKey);
  const parts = encryptedText.split(':');
  // 兼容旧 backend 格式（iv:tag:enc，16 字节 IV + 独立 tag）
  if (parts.length === 3) {
    const iv = fromHex(parts[0]);
    const tag = fromHex(parts[1]);
    const data = fromHex(parts[2]);
    const combined = new Uint8Array(data.length + tag.length);
    combined.set(data, 0);
    combined.set(tag, data.length);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, combined);
    return new TextDecoder().decode(decrypted);
  }
  if (parts.length !== 2) {
    throw new Error('[Encryption] invalid ciphertext format');
  }
  const [ivHex, dataHex] = parts;
  const iv = fromHex(ivHex);
  const data = fromHex(dataHex);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
