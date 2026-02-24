# DeepTerm App API Documentation

Base URL: `https://deepterm.net/api/app`

All API requests require authentication via the `x-api-key` header.

---

## Authentication

All endpoints require an API key to be passed in the request header:

```
x-api-key: YOUR_APP_API_KEY
```

Configure the API key in your `.env` file:
```
APP_API_KEY=your-secure-api-key-here
```

---

## Endpoints

### 1. Register User

Create a new user account from the app.

**Endpoint:** `POST /api/app/register`

**Headers:**
| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | Your API key | Yes |
| `Content-Type` | `application/json` | Yes |

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "deviceInfo": {
    "os": "macOS",
    "version": "14.0",
    "appVersion": "1.0.0"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | User's full name |
| `email` | string | Yes | User's email address (must be unique) |
| `password` | string | Yes | Password (minimum 8 characters) |
| `deviceInfo` | object | No | Optional device/app information |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "user": {
    "id": "clxyz123abc",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "license": {
    "valid": true,
    "plan": "free",
    "status": "active",
    "features": {
      "maxVaults": 1,
      "maxCredentials": 10,
      "teamMembers": 0,
      "ssoEnabled": false
    }
  }
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Name, email, and password are required` | Missing required fields |
| 400 | `Password must be at least 8 characters` | Password too short |
| 401 | `Invalid API key` | Missing or invalid API key |
| 409 | `An account with this email already exists` | Email already registered |
| 500 | `An error occurred during registration` | Server error |

---

### 2. Login User

Login a user from the app and retrieve their license info.

This endpoint authenticates the user via either:
- `Authorization: Bearer <accessToken>` (preferred if the app already authenticated for ZK Vault), or
- `email` + `password` (+ `twoFactorCode` if 2FA is enabled)

**Endpoint:** `POST /api/app/login`

**Headers:**
| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | Your API key | Yes |
| `Content-Type` | `application/json` | Yes |
| `Authorization` | `Bearer <accessToken>` | No (recommended) |

**Request Body (only if no `Authorization`):**
```json
{
  "email": "john@example.com",
  "password": "password123",
  "twoFactorCode": "123456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | If no `Authorization` | User's email address |
| `password` | string | If no `Authorization` | User's password |
| `twoFactorCode` | string | If enabled and no `Authorization` | Required if the user has 2FA enabled (TOTP or a backup code) |

**Success Response (200):**

Returns the same structure as `POST /api/app/validate` (user + license).

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Email and password are required` | Missing email/password when not using `Authorization` |
| 401 | `Invalid API key` | Missing/invalid API key |
| 401 | `INVALID_ACCESS_TOKEN` | `Authorization` token missing/invalid/expired (when provided) |
| 401 | `Invalid password` | Password mismatch |
| 401 | `2FA_REQUIRED` | User has 2FA enabled but no `twoFactorCode` provided |
| 401 | `INVALID_2FA_CODE` | `twoFactorCode` provided but invalid |
| 404 | `User not found` | No user with that email / token mapping |
| 500 | `An error occurred during login` | Server error |

---

### 3. Validate User (with Authentication)

Validate a user's credentials and retrieve their license information.

This endpoint authenticates the user via either:
- `Authorization: Bearer <accessToken>` (preferred if the app already authenticated for ZK Vault), or
- `email` + `password` (+ `twoFactorCode` if 2FA is enabled)

**Endpoint:** `POST /api/app/validate`

**Headers:**
| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | Your API key | Yes |
| `Content-Type` | `application/json` | Yes |
| `Authorization` | `Bearer <accessToken>` | No (recommended) |

**Request Body (only if no `Authorization`):**
```json
{
  "email": "john@example.com",
  "password": "password123",
  "twoFactorCode": "123456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | If no `Authorization` | User's email address |
| `password` | string | No | If provided, validates the password |
| `twoFactorCode` | string | If enabled and password provided (and no `Authorization`) | Required if the user has 2FA enabled (TOTP or a backup code) |

**Success Response (200):**

```json
{
  "valid": true,
  "authenticated": true,
  "user": {
    "id": "clxyz123abc",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "member",
    "twoFactorEnabled": false,
    "createdAt": "2026-02-08T10:30:00.000Z"
  },
  "license": {
    "valid": true,
    "plan": "pro",
    "status": "active",
    "teamId": "team123",
    "teamName": "Acme Inc",
    "seats": 10,
    "expiresAt": "2026-03-08T00:00:00.000Z",
    "features": {
      "maxVaults": 20,
      "maxCredentials": 200,
      "maxTeamMembers": 10,
      "ssoEnabled": false,
      "prioritySupport": true
    }
  }
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Email is required` | Missing email field (when no `Authorization`) |
| 401 | `Invalid API key` | Missing or invalid API key |
| 401 | `INVALID_ACCESS_TOKEN` | `Authorization` token missing/invalid/expired (when provided) |
| 401 | `Invalid password` | Password doesn't match (when password provided) |
| 401 | `2FA_REQUIRED` | User has 2FA enabled but no `twoFactorCode` provided |
| 401 | `INVALID_2FA_CODE` | `twoFactorCode` provided but invalid |
| 403 | `TOKEN_EMAIL_MISMATCH` | Provided `email` does not match the authenticated token user |
| 404 | `User not found` | No user with this email exists |
| 500 | `An error occurred during validation` | Server error |

---

### 4. Quick License Check

Check if a user exists and their license status without password validation.

This endpoint can be used either:
- With `email` query parameter (no password), or
- With `Authorization: Bearer <accessToken>` (email query becomes optional; if provided it must match the token user)

**Endpoint:** `GET /api/app/validate`

**Headers:**
| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | Your API key | Yes |
| `Authorization` | `Bearer <accessToken>` | No (optional) |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | If no `Authorization` | User's email address |

**Example Request:**
```
GET /api/app/validate?email=john@example.com
```

**Success Response - User Exists (200):**
```json
{
  "valid": true,
  "exists": true,
  "license": {
    "valid": true,
    "plan": "pro",
    "status": "active",
    "expiresAt": "2026-03-08T00:00:00.000Z",
    "features": {
      "maxVaults": 20,
      "maxCredentials": 200,
      "maxTeamMembers": 10,
      "ssoEnabled": false,
      "prioritySupport": true
    }
  }
}
```

**Response - User Does Not Exist (200):**
```json
{
  "valid": false,
  "exists": false
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Email parameter is required` | Missing email query parameter (when no `Authorization`) |
| 401 | `Invalid API key` | Missing or invalid API key |
| 401 | `INVALID_ACCESS_TOKEN` | `Authorization` token missing/invalid/expired (when provided) |
| 403 | `TOKEN_EMAIL_MISMATCH` | Provided `email` does not match the authenticated token user |
| 500 | `An error occurred during license check` | Server error |

---

### 5. Submit Issue (In-App)

Submit a support issue directly from the DeepTerm app.

This endpoint:
- Validates `x-api-key` (app-level)
- Authenticates the user via either:
  - `Authorization: Bearer <accessToken>` (preferred if the app already authenticated for ZK Vault), or
  - `email` + `password` (+ `twoFactorCode` if 2FA is enabled)
- Stores the issue, attachments (screenshots/log), and creates the first update entry

**Endpoint:** `POST /api/app/issues/submit`

**Headers:**
| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | Your API key | Yes |
| `Content-Type` | `multipart/form-data` | Yes |
| `Authorization` | `Bearer <accessToken>` | No (recommended) |

**Form Fields:**
| Field | Type | Required | Description |
|------|------|----------|-------------|
| `email` | string | If no `Authorization` | User email (must exist) |
| `password` | string | If no `Authorization` | User password |
| `twoFactorCode` | string | If enabled and no `Authorization` | Required if the user has 2FA enabled (TOTP or a backup code) |
| `title` | string | Yes | Short summary |
| `description` | string | Yes | Full description / steps to reproduce |
| `area` | string | No | One of: `General`, `SSH Remote Connection`, `SFTP`, `Vault`, `AI Assistant`, `Other` (defaults to `General`) |
| `screenshots` | file[] | No | Up to 5 screenshot image files (`image/*`) |
| `log` | file | No | Optional log file |

**Attachment limits:**
- Max screenshots: 5
- Max total attachments size: 25MB

**Example (curl):**

```bash
curl -X POST "https://deepterm.net/api/app/issues/submit" \
  -H "x-api-key: YOUR_APP_API_KEY" \
  -F "email=john@example.com" \
  -F "password=password123" \
  -F "title=SFTP upload fails" \
  -F "description=Steps:\n1) Connect\n2) Open SFTP\n3) Upload file\n\nExpected: Upload succeeds\nActual: Error -54" \
  -F "area=SFTP" \
  -F "screenshots=@/path/to/screenshot1.png" \
  -F "screenshots=@/path/to/screenshot2.png" \
  -F "log=@/path/to/deepterm.log"
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Issue submitted successfully",
  "issue": {
    "id": "clxyz123abc",
    "status": "open"
  }
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Email is required` | Missing `email` |
| 400 | `Password is required` | Missing `password` |
| 400 | `Title is required` | Missing `title` |
| 400 | `Description is required` | Missing `description` |
| 400 | `Screenshots must be image files.` | Invalid screenshot file type |
| 400 | `Too many screenshots (max 5).` | Too many screenshots |
| 400 | `Attachments too large (max 25MB total).` | Total attachment size too large |
| 401 | `Invalid API key` | Missing/invalid `x-api-key` |
| 401 | `INVALID_ACCESS_TOKEN` | `Authorization` token missing/invalid/expired (when provided) |
| 401 | `Invalid password` | Password mismatch |
| 401 | `2FA_REQUIRED` | User has 2FA enabled but no `twoFactorCode` provided |
| 401 | `INVALID_2FA_CODE` | `twoFactorCode` provided but invalid |
| 404 | `User not found` | No user with that email |
| 500 | `An error occurred while submitting the issue` | Server error |

---

### 6. Get Subscription / License Status

Retrieve the authenticated user's current subscription, plan features, and usage limits. This is the **recommended** endpoint for the app to check what features are available.

> **Note:** This endpoint lives under the ZK Vault API (`/api/zk/accounts/license`), not `/api/app/`. It requires a ZK Bearer token (not `x-api-key`). It supports both Stripe and Apple IAP subscriptions.

**Endpoint:** `GET /api/zk/accounts/license`

**Headers:**
| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <ZK accessToken>` | Yes |

**Success Response (200):**
```json
{
  "user": {
    "id": "zk_abc123",
    "email": "user@example.com",
    "name": "Jane Doe"
  },
  "license": {
    "valid": true,
    "plan": "pro",
    "status": "active",
    "expiresAt": "2026-03-19T00:00:00.000Z",
    "currentPeriodStart": "2026-02-19T00:00:00.000Z",
    "currentPeriodEnd": "2026-03-19T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "seats": 1,
    "teamId": "team_xyz",
    "teamName": "My Team",
    "source": "stripe"
  },
  "features": {
    "unlimitedHosts": true,
    "aiAssistant": true,
    "cloudVault": true,
    "allDevices": true,
    "sftpClient": true,
    "portForwarding": true,
    "prioritySupport": true,
    "teamVaults": false,
    "sso": false,
    "auditLogs": false,
    "roleBasedAccess": false
  },
  "limits": {
    "maxHosts": -1,
    "maxVaults": 10,
    "maxDevices": -1
  }
}
```

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `license.valid` | boolean | `true` if the user has an active paid subscription |
| `license.plan` | string | Effective plan: `starter`, `pro`, `team`, `business` |
| `license.status` | string | `active`, `trialing`, `past_due`, `canceled`, `free` |
| `license.source` | string | `stripe`, `apple`, or `none` |
| `license.cancelAtPeriodEnd` | boolean | If `true`, subscription won't renew at period end |
| `features.*` | boolean | Feature flags for the effective plan |
| `limits.*` | number | Usage limits (-1 = unlimited) |

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 401 | `Unauthorized` | Missing or invalid ZK Bearer token |
| 404 | `User not found` | ZK user not found |

**Usage notes:**
- Call this after obtaining a ZK access token (e.g., after `POST /api/zk/accounts/login-password`).
- When both Stripe and Apple IAP subscriptions are active, the higher-tier plan takes priority.
- The `features` object should be used to gate UI/functionality in the app.
- The `limits` object enforces hard limits (e.g., `maxHosts: 5` means block creating a 6th host).

---

## License Plans

| Plan | Max Hosts | Max Vaults | Max Devices | SSO | Priority Support |
|------|-----------|------------|-------------|-----|------------------|
| `starter` | 5 | 1 | 1 | No | No |
| `pro` | Unlimited | 10 | Unlimited | No | Yes |
| `team` | Unlimited | Unlimited | Unlimited | Yes | Yes |
| `business` | Unlimited | Unlimited | Unlimited | Yes | Yes |

---

## Subscription Status Values

| Status | Description |
|--------|-------------|
| `active` | Subscription is active and valid |
| `trialing` | User is on a trial period |
| `past_due` | Payment failed, grace period active |
| `canceled` | Subscription has been canceled |
| `incomplete` | Initial payment pending |

---

## Example Usage (Swift)

```swift
import Foundation

class DeepTermAPI {
    private let baseURL = "https://deepterm.net/api/app"
    private let apiKey = "YOUR_API_KEY"
    
    func registerUser(name: String, email: String, password: String) async throws -> RegistrationResponse {
        var request = URLRequest(url: URL(string: "\(baseURL)/register")!)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["name": name, "email": email, "password": password]
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(RegistrationResponse.self, from: data)
    }
    
    func validateUser(email: String, password: String? = nil) async throws -> ValidationResponse {
        var request = URLRequest(url: URL(string: "\(baseURL)/validate")!)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        var body: [String: String] = ["email": email]
        if let password = password {
            body["password"] = password
        }
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(ValidationResponse.self, from: data)
    }
    
    func checkLicense(email: String) async throws -> LicenseCheckResponse {
        var request = URLRequest(url: URL(string: "\(baseURL)/validate?email=\(email)")!)
        request.httpMethod = "GET"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(LicenseCheckResponse.self, from: data)
    }
}
```

---

## Example Usage (cURL)

**Register a user:**
```bash
curl -X POST https://deepterm.net/api/app/register \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com", "password": "password123"}'
```

**Validate user with password:**
```bash
curl -X POST https://deepterm.net/api/app/validate \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "password123"}'
```

**Quick license check:**
```bash
curl -X GET "https://deepterm.net/api/app/validate?email=john@example.com" \
  -H "x-api-key: YOUR_API_KEY"
```

---

# Admin License Management API

Base URL: `https://deepterm.net/api/admin/licenses`

These endpoints are for admin users only and require admin session authentication (cookie-based).

---

## Admin Endpoints

### 1. List All Licenses

Get a list of all user and team licenses.

**Endpoint:** `GET /api/admin/licenses`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Search by name or email |
| `type` | string | No | Filter by type: `all`, `team`, or `user` |

**Response:**
```json
{
  "licenses": [
    {
      "id": "team123",
      "type": "team",
      "name": "Acme Inc",
      "plan": "pro",
      "status": "active",
      "seats": 10,
      "memberCount": 5,
      "members": [
        { "id": "user1", "name": "John Doe", "email": "john@acme.com", "role": "owner" }
      ],
      "ssoEnabled": false,
      "expiresAt": "2026-03-08T00:00:00.000Z",
      "stripeSubscriptionId": "sub_xxx",
      "createdAt": "2026-01-08T00:00:00.000Z",
      "features": {
        "maxVaults": 20,
        "maxCredentials": 200,
        "maxTeamMembers": 10,
        "ssoEnabled": false,
        "prioritySupport": true
      }
    }
  ],
  "plans": ["free", "starter", "pro", "team", "enterprise"],
  "planFeatures": { ... }
}
```

---

### 2. Create License for User

Create a new team with a license for an existing user.

**Endpoint:** `POST /api/admin/licenses`

**Request Body:**
```json
{
  "userId": "user123",
  "teamName": "New Team",
  "plan": "pro",
  "seats": 10,
  "expiresAt": "2027-02-08"
}
```

**Response:**
```json
{
  "success": true,
  "team": {
    "id": "team456",
    "name": "New Team",
    "plan": "pro",
    "seats": 10
  }
}
```

---

### 3. Update License

Update a team or user license.

**Endpoint:** `PATCH /api/admin/licenses/{id}`

**Request Body:**
```json
{
  "type": "team",
  "plan": "enterprise",
  "seats": 100,
  "status": "active",
  "expiresAt": "2027-12-31",
  "ssoEnabled": true
}
```

**Response:**
```json
{
  "success": true,
  "license": {
    "id": "team123",
    "plan": "enterprise",
    "seats": 100,
    ...
  }
}
```

---

### 4. Revoke License

Delete a team license and remove all members.

**Endpoint:** `DELETE /api/admin/licenses/{id}?type=team`

**Response:**
```json
{
  "success": true,
  "message": "Team license revoked and team deleted"
}
```
