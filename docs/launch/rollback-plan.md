# Rollback Plan

## Triggers
- Crash-free rate drops below 98%
- Critical data-loss bug
- Authentication outage

## Steps
1. Pause rollout in store console.
2. Revert to prior stable build.
3. Disable high-risk features server-side.
4. Restore from backups where required.
5. Communicate status to users.
