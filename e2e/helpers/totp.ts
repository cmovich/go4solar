import { createHmac } from 'node:crypto'

/** RFC 4648 base32 → bytes (Supabase TOTP secrets are base32, no padding). */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input
    .toUpperCase()
    .replace(/=+$/, '')
    .replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | alphabet.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — what Google Authenticator and Supabase use. */
export function totp(secretBase32: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff)) %
    1_000_000
  return code.toString().padStart(6, '0')
}
