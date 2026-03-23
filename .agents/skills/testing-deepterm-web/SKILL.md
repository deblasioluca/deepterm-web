# Testing DeepTerm Web — Auth & Organization Flows

## Environment

- **Production server**: rp5m3 (`100.96.166.43`) via Tailscale
- **Web URL**: https://deepterm.net
- **SSH access**: `ssh macan@100.96.166.43`
- **App directory on server**: `/home/macan/deepterm`
- **Database**: SQLite at `/home/macan/deepterm/prisma/dev.db`
- **Process manager**: PM2 (process name: `deepterm`)

## Devin Secrets Needed

- `TAILSCALE_AUTH_KEY` — Tailscale auth key to join the tailnet and reach rp5m3
- `DEEPTERM_TEST_USER_PASSWORD` — Password for test user `lucadeblasio1972@gmail.com` (if available; otherwise set a temp password via DB)

## Deployment to rp5m3

```bash
ssh macan@100.96.166.43 "cd /home/macan/deepterm && git checkout main && git pull origin main && npm run build 2>&1 | tail -10 && pm2 restart deepterm"
```

For feature branches (before merge):
```bash
ssh macan@100.96.166.43 "cd /home/macan/deepterm && git fetch origin BRANCH_NAME && git checkout BRANCH_NAME && git pull origin BRANCH_NAME && npm run build 2>&1 | tail -10 && pm2 restart deepterm"
```

## Database Inspection

Useful queries for testing auth/org flows:

```bash
# Check User records
sqlite3 prisma/dev.db "SELECT id, name, email, passwordHash IS NOT NULL as hasPassword FROM User WHERE email = 'TARGET_EMAIL';"

# Check ZKUser linkage (session-only users won't have one)
sqlite3 prisma/dev.db "SELECT id, email, webUserId FROM ZKUser WHERE email = 'TARGET_EMAIL' OR webUserId = 'USER_ID';"

# Check org membership / invites
sqlite3 prisma/dev.db "SELECT ou.id, ou.userId, ou.invitedEmail, ou.role, ou.status, o.name FROM OrganizationUser ou JOIN Organization o ON ou.organizationId = o.id WHERE ou.invitedEmail = 'TARGET_EMAIL';"
```

## Auth Architecture

- **NextAuth** handles web login (email/password, GitHub OAuth, Apple OAuth, Passkeys)
- **ZKUser** is a separate record linked via `webUserId` — required for vault/crypto operations
- **Session-only users**: Have a NextAuth `User` record but no `ZKUser`. These users can see org invitations but cannot perform write operations (accept invite, manage members, etc.)
- **SessionOnlyAuth type**: Returned by `getAuthFromRequestOrSession` when no ZKUser exists. Has `kind: 'session'`, `webUserId`, `email` — never has `userId` (which is a ZKUser.id)
- **isSessionOnlyAuth guard**: All org routes that need a ZKUser.id check `if (!auth || isSessionOnlyAuth(auth))` and return 401

## Testing Patterns

### Testing as a session-only user (no ZKUser)
1. Find or create a User record without a corresponding ZKUser
2. If you don't have the password, temporarily set one via DB:
   ```bash
   # Generate bcrypt hash (run locally in deepterm-web dir)
   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('TestPass123!', 10).then(h => console.log(h));"
   
   # Save original hash first!
   sqlite3 prisma/dev.db "SELECT passwordHash FROM User WHERE email = 'TARGET_EMAIL';"
   
   # Set temporary password
   sqlite3 prisma/dev.db "UPDATE User SET passwordHash = 'BCRYPT_HASH' WHERE email = 'TARGET_EMAIL';"
   ```
3. Log in via browser at https://deepterm.net/login
4. Navigate to /dashboard/organization
5. **Always restore the original password hash after testing**

### Expected behaviors for session-only users
- `/dashboard/organization`: Should show "Pending Invitations" banner with invited orgs (NOT "No Organizations Yet")
- Accept invite button: Should trigger 401 (not 500) — guard prevents session-only users from accepting
- All write/admin org routes: Should return 401
- `GET /api/zk/organizations`: Should return orgs where `invitedEmail` matches the user's email

### Verifying API responses
Open browser DevTools Network tab before clicking UI buttons to capture:
- HTTP status codes (401 = guard working, 500 = bug, 200 = success)
- Response body for error messages

## Key Files

- `src/lib/zk/middleware.ts` — Auth resolution, SessionOnlyAuth type, isSessionOnlyAuth guard
- `src/app/api/zk/organizations/route.ts` — Org listing with invitedEmail query
- `src/app/api/zk/invitations/pending/route.ts` — Pending invitations
- `src/app/dashboard/organization/page.tsx` — Organization UI page
- `src/lib/auth.ts` — NextAuth configuration (providers, callbacks)

## Common Issues

- **Build fails with missing env vars**: The `next build` on rp5m3 may show env validation errors but these are runtime page-collection errors, not TypeScript errors. Use `npx tsc --noEmit` locally for type checking.
- **Tailscale might need re-auth**: If SSH to rp5m3 fails, check `tailscale status` and re-authenticate if needed.
- **Password hash escaping in sqlite3**: When setting bcrypt hashes via SSH + sqlite3, the `$` characters need escaping: use `'\\$2a\\$10\\$...'` in the SSH command string.
