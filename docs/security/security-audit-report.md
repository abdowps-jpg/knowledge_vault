# Security Audit Report (Draft)

Date: 2026-02-17

## Completed
- JWT auth middleware in backend context
- Protected procedure support in tRPC
- Password hashing with bcrypt
- Token verification path implemented

## Pending Hardening
- Add `helmet` and `express-rate-limit`
- Raise bcrypt rounds to >=12
- Add SQLCipher strategy and key management
- Add strict secret management (`.env`)
- Add auth endpoint rate limits and abuse monitoring

## Pentest Checklist
- [ ] SQL injection attempts
- [ ] XSS payloads
- [ ] CSRF scenarios
- [ ] Auth bypass
- [ ] Authorization bypass
- [ ] Rate limit validation
