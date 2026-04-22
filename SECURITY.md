# Security Policy

## Supported versions

We support the latest `main` branch. If you are self-hosting from an older
commit, please upgrade before reporting an issue.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, either:

1. Submit feedback from Settings → Send Feedback inside the app, picking
   "bug" and starting the subject with `[security]`. This arrives at the
   server's feedback table which is only visible to admins.
2. Or email the address in the repository owner's GitHub profile with a
   subject line starting `[security]`.

We try to respond within **72 hours** on weekdays. If you haven't heard back
in a week, ping again — messages occasionally get lost.

## What to include

- A short description of the vulnerability
- Steps to reproduce (ideally one or two tRPC / REST calls)
- What you think the impact is
- Your GitHub handle (or "prefer to stay anonymous") so we can credit you
  in the fix commit

## What we consider in scope

- Authentication bypass, session fixation, token leaks
- Privilege escalation (e.g. a non-owner editing another user's items)
- SQL injection, SSRF, XSS in anything the server renders
- Rate-limit bypass, webhook signature bypass, API-key scope bypass
- Any CVE in a dependency that is exploitable in our deployment

## What we consider out of scope

- Social-engineering attacks against app users or staff
- Missing security headers on static marketing pages that carry no data
- Denial-of-service attacks relying on unlimited request volume from a
  single IP (our rate limit is a best-effort mitigation, not a hard
  guarantee)
- Attacks against someone else's self-hosted deployment where we don't
  operate the infrastructure
- Attacks requiring a compromised device or physical access

## After a fix ships

- A commit tagged with the reporter's handle (unless they asked for
  anonymity)
- A changelog entry under the next release heading
- For high-severity issues we will draft a short advisory noting the
  vulnerable commit range so self-hosters can assess exposure
