# Security Policy

## Supported Versions

This package is pre-1.0. Only the latest published minor version receives
security fixes.

| Version            | Supported          |
| ------------------ | ------------------ |
| 0.x (latest minor) | :white_check_mark: |
| < latest minor     | :x:                |

Once the package reaches 1.0, this table will be updated with a longer-lived
support policy.

## Reporting a Vulnerability

**Please do not open a public issue for security reports.**

Report vulnerabilities privately using GitHub's Security Advisories flow:

- Go to the **Security** tab of this repository -> **Report a vulnerability**, or
- Use this link directly: https://github.com/NovaVey/multi-tenant-security-kit/security/advisories/new

Include as much detail as you can: affected version(s), the module involved
(e.g. `tenant`, `rbac`, `rate-limit`, `audit`, `rls`, `crypto`), reproduction
steps, and the potential impact.

If GitHub Security Advisories is not reachable for you, you may instead
contact **novavey.ai@gmail.com** as a secondary channel.

### What to expect

- We aim to acknowledge new reports within **3 business days**.
- We will work with you to understand and confirm the issue, develop a fix,
  and coordinate a disclosure timeline before any public details are
  published.
- Fixes are released as part of coordinated disclosure. Reporters are
  credited in the release notes unless they prefer to remain anonymous.
