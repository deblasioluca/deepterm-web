import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type AuthenticatorTransportFuture,
  type CredentialDeviceType,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';

// Configuration
const rpName = 'DeepTerm';
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
const origin = process.env.NEXTAUTH_URL || `https://${rpID}`;

// Types
export interface StoredPasskey {
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: CredentialDeviceType | null;
  backedUp: boolean;
  transports: AuthenticatorTransportFuture[] | null;
}

/**
 * Generate options for registering a new passkey
 */
export async function generatePasskeyRegistrationOptions(
  userId: string,
  userEmail: string,
  userName: string,
  existingPasskeys: StoredPasskey[]
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userName,
    // Don't allow re-registering existing passkeys
    excludeCredentials: existingPasskeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports || undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      // Allow both platform (Face ID, Touch ID, Windows Hello) and cross-platform (security keys)
      // authenticatorAttachment: 'platform', // Removed to allow any authenticator
    },
    // Support various algorithms
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  });

  return options;
}

/**
 * Verify a passkey registration response
 */
export async function verifyPasskeyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
}

/**
 * Generate options for authenticating with a passkey
 */
export async function generatePasskeyAuthenticationOptions(
  allowedPasskeys?: StoredPasskey[]
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    // If we have specific passkeys, only allow those
    allowCredentials: allowedPasskeys?.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports || undefined,
    })),
  });

  return options;
}

/**
 * Verify a passkey authentication response
 */
export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  passkey: StoredPasskey
): Promise<VerifiedAuthenticationResponse> {
  // Convert base64url strings to Uint8Array with proper buffer type
  const publicKeyData = base64URLToUint8Array(passkey.publicKey);
  // Create a properly typed Uint8Array for the credential
  const credentialPublicKey = new Uint8Array(publicKeyData) as Uint8Array<ArrayBuffer>;

  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: passkey.credentialId,
      publicKey: credentialPublicKey,
      counter: passkey.counter,
      transports: passkey.transports || undefined,
    },
  });
}

/**
 * Convert Uint8Array to base64url string
 */
export function uint8ArrayToBase64URL(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Convert base64url string to Uint8Array
 */
export function base64URLToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = Buffer.from(base64 + padding, 'base64');
  return new Uint8Array(binary);
}

export { rpID, rpName, origin };
