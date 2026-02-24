# DeepTerm Unified Account — App Implementation Guide

**Date:** February 2026  
**Goal:** One account, one login. Users should never see "vault account" vs "web account."

---

## Current State (Server-Side — Already Implemented)

The server now supports a unified account flow. Here's what's in place:

| Endpoint | Purpose |
|---|---|
| `POST /api/zk/accounts/check` | **NEW** — Tells the app which login method to use for a given email |
| `POST /api/zk/accounts/login-password` | Login with plain email + password (auto-creates ZKUser if needed) |
| `POST /api/zk/accounts/login-password-2fa` | Same but with 2FA code |
| `POST /api/zk/accounts/login` | Original ZK login (email + client-hashed masterPasswordHash) |
| `POST /api/zk/accounts/register` | Full ZK registration (auto-creates web User if needed) |
| `POST /api/zk/accounts/keys/initialize` | Upload encryption keys after password-based login (first-time setup) |
| `POST /api/zk/accounts/keys` | Update/rotate encrypted keys (and optionally sync masterPasswordHash/KDF params) |
| `POST /api/register` | Web registration (now auto-links existing ZKUser) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    USER EXPERIENCE                           │
│                                                              │
│   "Log in with your DeepTerm account"                        │
│   Email: ___________                                         │
│   Password: ________                                         │
│   [Continue]                                                 │
│                                                              │
│   Don't have an account? Register                            │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│               APP LOGIN FLOW (behind the scenes)             │
│                                                              │
│  1. POST /accounts/check { email }                           │
│     ├─ "zk_login"      → Client-side hash, POST /login      │
│     ├─ "password_login" → POST /login-password               │
│     └─ "register"       → Show registration screen           │
│                                                              │
│  2. If response has `hasKeys: false`:                        │
│     → Generate encryption keys client-side                   │
│     → POST /accounts/keys/initialize to upload them           │
│                                                              │
│  3. Sync vaults: GET /sync                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## App Implementation Steps

### Step 1: Replace the Login Screen

Remove any concept of "vault login" vs "app login." The user sees **one** login form.

```swift
// LoginView.swift — Unified login screen
struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var twoFactorCode = ""
    @State private var showTwoFactor = false
    @State private var isLoading = false
    @State private var error: String?
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Log in to DeepTerm")
                .font(.title2.bold())
            
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .autocapitalization(.none)
            
            SecureField("Password", text: $password)
                .textContentType(.password)
            
            if showTwoFactor {
                TextField("2FA Code", text: $twoFactorCode)
                    .keyboardType(.numberPad)
            }
            
            Button("Continue") { Task { await login() } }
                .disabled(isLoading)
            
            // Link to registration
            Button("Don't have an account? Register") {
                // Navigate to registration
            }
        }
    }
    
    func login() async {
        isLoading = true
        error = nil
        
        do {
            // Step 1: Check which login method to use
            let checkResult = try await AccountService.checkAccount(email: email)
            
            switch checkResult.loginMethod {
            case .zkLogin:
                // User has full ZK account with encryption keys
                try await loginWithMasterPasswordHash(
                    kdfType: checkResult.kdfType,
                    kdfIterations: checkResult.kdfIterations,
                    kdfMemory: checkResult.kdfMemory,
                    kdfParallelism: checkResult.kdfParallelism
                )
                
            case .passwordLogin:
                // User has web account but no ZK setup yet (or ZK without keys)
                try await loginWithPassword()
                
            case .register:
                // No account — redirect to registration
                // Navigate to registration screen
                return
            }
        } catch {
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
}
```

---

### Step 2: Implement the Account Check

```swift
// AccountService.swift

enum LoginMethod: String, Codable {
    case zkLogin = "zk_login"
    case passwordLogin = "password_login"
    case register = "register"
}

struct AccountCheckResult: Codable {
    let exists: Bool
    let loginMethod: LoginMethod
    let message: String
    let kdfType: Int?
    let kdfIterations: Int?
    let kdfMemory: Int?
    let kdfParallelism: Int?
    let requires2FA: Bool
}

class AccountService {
    static let baseURL = "https://deepterm.net/api/zk"
    
    /// Check what kind of account exists for this email
    static func checkAccount(email: String) async throws -> AccountCheckResult {
        let url = URL(string: "\(baseURL)/accounts/check")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        // Server wraps response in { "data": ... }
        struct Wrapper: Codable { let data: AccountCheckResult }
        let wrapper = try JSONDecoder().decode(Wrapper.self, from: data)
        return wrapper.data
    }
}
```

---

### Step 3: Implement Password-Based Login

This is the path for users who registered on the web or have a ZK account without keys.

```swift
// AccountService.swift (continued)

struct PasswordLoginResult: Codable {
    let accessToken: String?
    let refreshToken: String?
    let expiresIn: Int?
    let defaultVaultId: String?
    let requires2FA: Bool?
    let user: LoginUser?
    
    // These are only present if the ZK account already has keys
    let protectedSymmetricKey: String?
    let publicKey: String?
    let encryptedPrivateKey: String?
    let kdfType: Int?
    let kdfIterations: Int?
    let kdfMemory: Int?
    let kdfParallelism: Int?
    
    struct LoginUser: Codable {
        let id: String
        let email: String
        let name: String?
        let hasKeys: Bool
    }
}

extension AccountService {
    
    /// Login with plain email + password
    /// Server auto-creates ZKUser if only web User exists
    static func loginWithPassword(
        email: String,
        password: String,
        deviceName: String,
        deviceType: String = "desktop"
    ) async throws -> PasswordLoginResult {
        let url = URL(string: "\(baseURL)/accounts/login-password")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = [
            "email": email,
            "password": password,
            "deviceName": deviceName,
            "deviceType": deviceType,
        ]
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        struct Wrapper: Codable { let data: PasswordLoginResult }
        let wrapper = try JSONDecoder().decode(Wrapper.self, from: data)
        return wrapper.data
    }
    
    /// Complete password login with 2FA code
    static func loginWithPassword2FA(
        email: String,
        password: String,
        code: String,
        deviceName: String,
        deviceType: String = "desktop"
    ) async throws -> PasswordLoginResult {
        let url = URL(string: "\(baseURL)/accounts/login-password-2fa")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = [
            "email": email,
            "password": password,
            "code": code,
            "deviceName": deviceName,
            "deviceType": deviceType,
        ]
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        struct Wrapper: Codable { let data: PasswordLoginResult }
        let wrapper = try JSONDecoder().decode(Wrapper.self, from: data)
        return wrapper.data
    }
}
```

---

### Step 4: Handle "No Keys" — Generate Encryption Keys After Login

When the server returns `hasKeys: false`, the app must generate encryption keys and upload them. This happens transparently — the user doesn't see it.

```swift
// KeySetupService.swift

class KeySetupService {
    
    /// Called after password login when hasKeys == false
    /// Generates all encryption keys and uploads them to the server
    static func setupEncryptionKeys(
        password: String,
        email: String,
        accessToken: String
    ) async throws {
        // 1. Derive master key from password
        //    masterKey = PBKDF2-SHA256(password, email, 600000 iterations)
        let masterKey = try CryptoUtils.deriveMasterKey(
            password: password,
            salt: email.lowercased(),
            iterations: 600_000
        )
        
        // 2. Generate symmetric key (random 512-bit)
        let symmetricKey = CryptoUtils.generateRandomKey(bytes: 64)
        
        // 3. Encrypt symmetric key with master key
        //    protectedSymmetricKey = AES-256-CBC(symmetricKey, masterKey) + HMAC
        let protectedSymmetricKey = try CryptoUtils.encryptSymmetricKey(
            symmetricKey: symmetricKey,
            masterKey: masterKey
        )
        
        // 4. Generate RSA-2048 key pair
        let (publicKeyPEM, privateKeyPEM) = try CryptoUtils.generateRSAKeyPair()
        
        // 5. Encrypt private key with symmetric key
        let encryptedPrivateKey = try CryptoUtils.encrypt(
            data: privateKeyPEM,
            key: symmetricKey
        )
        
        // 6. Compute master password hash for future ZK logins
        //    masterPasswordHash = PBKDF2-SHA256(masterKey, password, 1 iteration)
        let masterPasswordHash = try CryptoUtils.deriveMasterPasswordHash(
            masterKey: masterKey,
            password: password
        )
        
        // 7. Upload keys to server
        try await uploadKeys(
            accessToken: accessToken,
            masterPasswordHash: masterPasswordHash,
            protectedSymmetricKey: protectedSymmetricKey,
            publicKey: publicKeyPEM,
            encryptedPrivateKey: encryptedPrivateKey,
            kdfType: 0,
            kdfIterations: 600_000
        )
        
        // 8. Save master key / symmetric key in Keychain for session use
        try KeychainService.saveMasterKey(masterKey)
        try KeychainService.saveSymmetricKey(symmetricKey)
    }
    
    /// Upload encryption keys to the server
    private static func uploadKeys(
        accessToken: String,
        masterPasswordHash: String,
        protectedSymmetricKey: String,
        publicKey: String,
        encryptedPrivateKey: String,
        kdfType: Int,
        kdfIterations: Int
    ) async throws {
        let url = URL(string: "\(AccountService.baseURL)/accounts/keys")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        let body: [String: Any] = [
            "masterPasswordHash": masterPasswordHash,
            "protectedSymmetricKey": protectedSymmetricKey,
            "publicKey": publicKey,
            "encryptedPrivateKey": encryptedPrivateKey,
            "kdfType": kdfType,
            "kdfIterations": kdfIterations,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AccountError.keyUploadFailed
        }
    }
}
```

---

### Step 5: Unified Login Flow (Putting It All Together)

```swift
// LoginCoordinator.swift

class LoginCoordinator {
    
    /// Main entry point — handles the entire login flow
    func login(email: String, password: String, twoFactorCode: String? = nil) async throws {
        let deviceName = Host.current().localizedName ?? "Mac"
        
        // Step 1: Check account status
        let check = try await AccountService.checkAccount(email: email)
        
        switch check.loginMethod {
        case .zkLogin:
            // Full ZK account — derive hash client-side, login with masterPasswordHash
            let masterKey = try CryptoUtils.deriveMasterKey(
                password: password,
                salt: email.lowercased(),
                iterations: check.kdfIterations ?? 600_000,
                kdfType: check.kdfType ?? 0,
                memory: check.kdfMemory,
                parallelism: check.kdfParallelism
            )
            
            let masterPasswordHash = try CryptoUtils.deriveMasterPasswordHash(
                masterKey: masterKey,
                password: password
            )
            
            let result = try await AccountService.loginWithMasterPasswordHash(
                email: email,
                masterPasswordHash: masterPasswordHash,
                deviceName: deviceName
            )
            
            // Decrypt encryption keys with master key
            try await VaultManager.shared.unlock(
                masterKey: masterKey,
                protectedSymmetricKey: result.protectedSymmetricKey,
                encryptedPrivateKey: result.encryptedPrivateKey
            )
            
            // Store tokens
            TokenManager.shared.setTokens(
                access: result.accessToken,
                refresh: result.refreshToken
            )
            
        case .passwordLogin:
            // Web account or ZK without keys — login with plain password
            var result: PasswordLoginResult
            
            if check.requires2FA {
                guard let code = twoFactorCode else {
                    // Signal to UI to show 2FA prompt
                    throw AccountError.twoFactorRequired
                }
                result = try await AccountService.loginWithPassword2FA(
                    email: email,
                    password: password,
                    code: code,
                    deviceName: deviceName
                )
            } else {
                result = try await AccountService.loginWithPassword(
                    email: email,
                    password: password,
                    deviceName: deviceName
                )
                
                // Check if 2FA required (server returns this flag)
                if result.requires2FA == true {
                    throw AccountError.twoFactorRequired
                }
            }
            
            // Store tokens
            TokenManager.shared.setTokens(
                access: result.accessToken!,
                refresh: result.refreshToken!
            )
            
            // Check if encryption keys need to be generated
            if result.user?.hasKeys == false {
                // Generate and upload encryption keys
                // This is transparent to the user — they just see a brief "Setting up..." spinner
                try await KeySetupService.setupEncryptionKeys(
                    password: password,
                    email: email,
                    accessToken: result.accessToken!
                )
            } else if let protectedSymmetricKey = result.protectedSymmetricKey,
                      let encryptedPrivateKey = result.encryptedPrivateKey {
                // Keys exist — decrypt them
                let masterKey = try CryptoUtils.deriveMasterKey(
                    password: password,
                    salt: email.lowercased(),
                    iterations: result.kdfIterations ?? 600_000
                )
                try await VaultManager.shared.unlock(
                    masterKey: masterKey,
                    protectedSymmetricKey: protectedSymmetricKey,
                    encryptedPrivateKey: encryptedPrivateKey
                )
            }
            
        case .register:
            throw AccountError.noAccount
        }
        
        // Success — sync vaults
        try await VaultManager.shared.fullSync()
    }
}
```

---

### Step 6: Update Registration to Match

Registration should create both accounts at once. The existing `/api/zk/accounts/register` endpoint already handles this.

```swift
// RegistrationCoordinator.swift

class RegistrationCoordinator {
    
    func register(name: String, email: String, password: String) async throws {
        // 1. Derive all keys client-side
        let masterKey = try CryptoUtils.deriveMasterKey(
            password: password,
            salt: email.lowercased(),
            iterations: 600_000
        )
        
        let masterPasswordHash = try CryptoUtils.deriveMasterPasswordHash(
            masterKey: masterKey,
            password: password
        )
        
        let symmetricKey = CryptoUtils.generateRandomKey(bytes: 64)
        let protectedSymmetricKey = try CryptoUtils.encryptSymmetricKey(
            symmetricKey: symmetricKey,
            masterKey: masterKey
        )
        
        let (publicKeyPEM, privateKeyPEM) = try CryptoUtils.generateRSAKeyPair()
        let encryptedPrivateKey = try CryptoUtils.encrypt(
            data: privateKeyPEM,
            key: symmetricKey
        )
        
        // 2. Register via ZK endpoint (auto-creates web User too)
        let result = try await AccountService.register(
            email: email,
            masterPasswordHash: masterPasswordHash,
            protectedSymmetricKey: protectedSymmetricKey,
            publicKey: publicKeyPEM,
            encryptedPrivateKey: encryptedPrivateKey,
            kdfType: 0,
            kdfIterations: 600_000
        )
        
        // 3. Save keys in Keychain
        try KeychainService.saveMasterKey(masterKey)
        try KeychainService.saveSymmetricKey(symmetricKey)
        
        // 4. Auto-login after registration
        try await LoginCoordinator().login(email: email, password: password)
    }
}
```

---

## API Reference

### POST /api/zk/accounts/check

Check which login method to use for a given email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
    "exists": true,
    "loginMethod": "zk_login",    // "zk_login" | "password_login" | "register"
    "message": "Account found. Use master password hash login.",
    "kdfType": 0,                  // Only for zk_login
    "kdfIterations": 600000,       // Only for zk_login
    "kdfMemory": null,             // Only for Argon2id
    "kdfParallelism": null,        // Only for Argon2id
    "requires2FA": false
}
```

**Important:** ZK endpoints return JSON objects directly (no `{ "data": ... }` wrapper). Client decoders must not require a `data` envelope.

### POST /api/zk/accounts/login-password

Login with plain email + password. Auto-creates ZKUser if only web User exists.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "plaintext_password",
  "deviceName": "MacBook Pro",
  "deviceType": "desktop"
}
```

**Response (success):**
```json
{
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "expiresIn": 900,
    "defaultVaultId": "clm...",
    "user": {
        "id": "clm...",
        "email": "user@example.com",
        "name": "User Name",
        "hasKeys": false
    },
    "protectedSymmetricKey": "...",   // Only if hasKeys == true
    "publicKey": "...",               // Only if hasKeys == true
    "encryptedPrivateKey": "...",     // Only if hasKeys == true
    "kdfType": 0,                     // Only if hasKeys == true
    "kdfIterations": 600000,          // Only if hasKeys == true
    "device": { "id": "...", "name": "MacBook Pro", "type": "desktop" },
    "subscription": { "plan": "free", "status": null, "teamName": "..." }
}
```

**Response (2FA required):**
```json
{
    "requires2FA": true,
    "email": "user@example.com",
    "message": "Two-factor authentication required"
}
```

### POST /api/zk/accounts/login-password-2fa

Same as login-password but with 2FA code. Accepts TOTP codes and backup codes.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "plaintext_password",
  "code": "123456",
  "deviceName": "MacBook Pro",
  "deviceType": "desktop"
}
```

### POST /api/zk/accounts/keys/initialize

Upload encryption keys after password-based login when `hasKeys == false`.

**Request:**
```json
{
  "protectedSymmetricKey": "<encrypted symmetric key>",
  "publicKey": "<RSA public key PEM>",
  "encryptedPrivateKey": "<encrypted RSA private key>",

    // Recommended: also send this so future sessions can use hash-based login (/accounts/login)
    // even if the ZK user was initially created via password login.
    "masterPasswordHash": "<base64 PBKDF2 hash>",
    "kdfType": 0,
    "kdfIterations": 600000,
    "kdfMemory": null,
    "kdfParallelism": null
}
```

**Headers:** `Authorization: Bearer <accessToken>`

---

## Flow Diagram

```
┌─────────────┐
│ User opens  │
│ app         │
└──────┬──────┘
       │
       ▼
┌──────────────┐      ┌────────────────────────────────────┐
│ Enter email  │─────▶│ POST /accounts/check { email }     │
│              │      └───────────────┬────────────────────┘
└──────────────┘                      │
                                      ▼
                         ┌────────────────────────┐
                         │ loginMethod?            │
                         └────────────┬───────────┘
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                  ▼
             ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
             │ "register"  │  │"password_    │  │ "zk_login"   │
             │             │  │  login"      │  │              │
             │ Show        │  │              │  │ Derive hash  │
             │ registration│  │ Send plain   │  │ from password│
             │ form        │  │ password     │  │ client-side  │
             └─────────────┘  └──────┬───────┘  └──────┬───────┘
                                     │                  │
                              ┌──────┘                  │
                              ▼                         │
                     ┌────────────────┐                 │
                     │ 2FA required?  │                 │
                     └───┬────────┬───┘                 │
                     Yes │        │ No                  │
                         ▼        │                     │
                  ┌────────────┐  │                     │
                  │ Show 2FA   │  │                     │
                  │ prompt     │  │                     │
                  │ POST       │  │                     │
                  │ /login-    │  │                     │
                  │ password-  │  │                     │
                  │ 2fa        │  │                     │
                  └──────┬─────┘  │                     │
                         │        │                     │
                         ▼        ▼                     ▼
                    ┌──────────────────────────────────────┐
                    │ Login response received               │
                    │                                       │
                    │ hasKeys == true?                       │
                    │  → Decrypt keys, unlock vault          │
                    │                                       │
                    │ hasKeys == false?                      │
                    │  → Generate keys client-side           │
                    │  → POST /accounts/keys/initialize      │
                    │  → Unlock vault                        │
                    └──────────────────┬───────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ GET /sync        │
                              │ Vault is ready!  │
                              └─────────────────┘
```

---

## Key Points for App Developer

1. **Never ask the user which "account type" they want.** The check endpoint figures it out.

2. **The password field is always "Password"** — never "Master Password." Behind the scenes, the app derives the master key and hash from it, but the user doesn't need to know.

3. **Key generation is an implementation detail.** When `hasKeys == false`, show a brief spinner ("Setting up your vault...") and generate keys in the background. Takes 1-2 seconds.

4. **After first key setup, future logins use `zk_login`.** The `/accounts/check` endpoint will return `loginMethod: "zk_login"` with KDF params, and the app derives the hash client-side. This is faster and more secure.

5. **2FA is shared.** If the user enables 2FA on the web, the app respects it via the `password_login` path. The flow is: password login returns `requires2FA: true` → prompt for code → call `/login-password-2fa`.

6. **Store the email in the Keychain.** On next launch, pre-fill the email and call `/accounts/check` immediately to know the login method before the user types their password.

7. **Tokens refresh automatically.** The access token expires in 15 minutes. Use `POST /accounts/token/refresh` with the refresh token to get a new pair. Implement this as an HTTP interceptor.

---

## Migration Path for Existing Users

| Current State | What Happens |
|---|---|
| Has web account only | First app login via `password_login` → auto-creates ZKUser → generates keys → vault ready |
| Has ZK account only | Already has linked web User (created at ZK registration) → web login works |
| Has both (like current user) | `/accounts/check` returns `zk_login` → standard flow, no change |
| Has neither | Registration creates both → fully unified from day one |

---

## Multi-Device Login

When a user adds the app to a second (or third, etc.) device, everything works automatically:

1. `/accounts/check` returns `loginMethod: "zk_login"` — keys already exist from device 1
2. User enters password → app derives `masterPasswordHash` using KDF params from step 1
3. Server returns the **encrypted** keys (`protectedSymmetricKey`, `encryptedPrivateKey`, `publicKey`)
4. App decrypts them locally with the master key derived from the password
5. A new `Device` record is created/updated on the server (via `deviceName` + `deviceType`)
6. `GET /sync` pulls all vaults and items — decrypted locally on the new device

**No device-to-device transfer is needed.** The encrypted keys live on the server. Any device with the correct password can retrieve and unlock them.

### What the app should do on a new device:

```swift
// On new device login, same LoginCoordinator.login() is called.
// The flow automatically handles it:
//
// 1. checkAccount → "zk_login" (keys exist)
// 2. deriveMasterKey from password + KDF params
// 3. deriveMasterPasswordHash → POST /accounts/login
// 4. Server returns encrypted keys + tokens + NEW device registered
// 5. VaultManager.unlock() decrypts keys with masterKey
// 6. VaultManager.fullSync() downloads all vault items
//
// The user sees: enter email → enter password → vault loaded.
// Identical to device 1. No extra steps.
```

### Device tracking:

Each device is tracked via `POST /accounts/login` with `deviceName` + `deviceType`. The server creates a unique identifier (`userId:deviceName:deviceType`) and upserts a `Device` record. Users can see their devices in the web dashboard and revoke access if needed (by revoking refresh tokens).

---

## Files Modified on Server

| File | Change |
|---|---|
| `src/app/api/zk/accounts/check/route.ts` | **NEW** — Account status check endpoint |
| `src/app/api/register/route.ts` | Auto-links existing ZKUser on web registration |
| `src/app/api/zk/accounts/register/route.ts` | Already creates web User (no change needed) |
| `src/app/api/zk/accounts/login-password/route.ts` | Already auto-creates ZKUser (no change needed) |
| `src/app/api/zk/accounts/login-password-2fa/route.ts` | Already auto-creates ZKUser (no change needed) |
