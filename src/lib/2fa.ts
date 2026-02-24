import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * Generate a new TOTP secret (base32 encoded, 20 bytes = 32 chars)
 */
export function generateSecret(): string {
  // Generate 20 random bytes and encode as base32
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

/**
 * Base32 encoding for the secret
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  return result;
}

/**
 * Generate a TOTP auth URL for authenticator apps
 */
export function generateAuthURL(email: string, secret: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'DeepTerm',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret,
  });
  return totp.toString();
}

/**
 * Generate a QR code data URL for the TOTP secret
 */
export async function generateQRCode(authUrl: string): Promise<string> {
  return QRCode.toDataURL(authUrl, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * Verify a TOTP token
 */
export function verifyToken(token: string, secret: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'DeepTerm',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });
    
    // validate returns the delta (window offset) or null if invalid
    // Using window of 1 allows for clock skew
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Generate backup codes (10 codes, 8 characters each)
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Hash a backup code for storage
 */
export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

/**
 * Verify a backup code against stored hashed codes
 * Returns the remaining codes after use (minus the used one) or null if invalid
 */
export function verifyBackupCode(
  inputCode: string,
  hashedCodes: string[]
): string[] | null {
  const inputHash = hashBackupCode(inputCode);
  const index = hashedCodes.indexOf(inputHash);
  
  if (index === -1) {
    return null; // Code not found
  }
  
  // Remove the used code and return remaining
  return hashedCodes.filter((_, i) => i !== index);
}
