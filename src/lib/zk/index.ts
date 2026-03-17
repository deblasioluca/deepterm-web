// Zero-Knowledge Vault Library
// All exports from the ZK vault system

export * from './jwt';
export * from './rate-limit';
export * from './audit';
export * from './middleware';

// Type definitions for vault items
// Keep in sync with Swift VaultItemType in VaultAPIModels.swift
export enum VaultItemType {
  SSH_PASSWORD = 0,
  SSH_KEY = 1,
  SSH_CERTIFICATE = 2,
  MANAGED_KEY = 10,
  IDENTITY = 11,
  HOST_GROUP = 12,
}

export enum KDFType {
  PBKDF2 = 0,
  ARGON2ID = 1,
}

export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  READONLY = 'readonly',
}

export enum OrganizationUserStatus {
  INVITED = 'invited',
  ACCEPTED = 'accepted',
  CONFIRMED = 'confirmed',
  REVOKED = 'revoked',
}

// Default KDF parameters
export const DEFAULT_PBKDF2_ITERATIONS = 600000;
export const DEFAULT_ARGON2_MEMORY = 64 * 1024; // 64 MB in KB
export const DEFAULT_ARGON2_PARALLELISM = 4;
export const DEFAULT_ARGON2_ITERATIONS = 3;
