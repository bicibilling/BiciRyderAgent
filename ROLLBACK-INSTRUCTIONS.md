# Rollback Instructions for Extension Dialing Changes

## Changes Made (Commit: df7c529)

### Dev Environment (`agent_configs/dev/ryder-bici-ai.json`)
1. **Phone Number**: Changed from +16047232137 to +17787193080
2. **Transfer Type**: Changed from "conference" to "sip_refer"
3. **Added Tool**: play_keypad_touch_tone system tool
4. **Prompt Update**: Added instruction to dial extension 5 after transfer

### Prod Environment (`agent_configs/prod/ryder-bici-ai.json`)
1. **Phone Number**: Changed from +16047232137 to +17787193080
2. **Transfer Type**: Changed from "conference" to "sip_refer"
3. **Added Tool**: play_keypad_touch_tone system tool

## Rollback Procedure

### Option 1: Restore from Backup Files
```bash
# Restore dev config
cp agent_configs/dev/ryder-bici-ai.json.backup-20250919-232901 agent_configs/dev/ryder-bici-ai.json

# Restore prod config
cp agent_configs/prod/ryder-bici-ai.json.backup-20250919-232905 agent_configs/prod/ryder-bici-ai.json

# Commit and push rollback
git add agent_configs/dev/ryder-bici-ai.json agent_configs/prod/ryder-bici-ai.json
git commit -m "rollback: revert extension dialing changes - restore conference transfer"
git push
```

### Option 2: Git Revert
```bash
# Revert the specific commit
git revert df7c529

# Or reset to previous commit (more aggressive)
git reset --hard 04ea53f
git push --force-with-lease
```

### Option 3: Manual Revert Changes

**In both dev and prod configs, change back:**

1. **Phone number**: +17787193080 → +16047232137
2. **Transfer type**: "sip_refer" → "conference"
3. **Remove**: The entire play_keypad_touch_tone tool section
4. **Prompt**: Remove the line about using keypad tool with "WW5"

## Deploy After Rollback

After making rollback changes:

```bash
# Deploy to dev environment
convai sync --env dev

# Test the rollback
# Call agent and request human transfer to verify old behavior

# Deploy to prod environment
convai sync --env prod
```

## Testing Rollback Success

1. **Call the agent**: +1 (604) 670-0262
2. **Request human transfer**: Say "I want to talk to a human"
3. **Verify behavior**: Should transfer to +16047232137 (old number) with conference transfer
4. **No extension dialing**: Should NOT attempt to dial extension 5

## Backup File Locations

- Dev backup: `agent_configs/dev/ryder-bici-ai.json.backup-20250919-232901`
- Prod backup: `agent_configs/prod/ryder-bici-ai.json.backup-20250919-232905`

## Emergency Contact

If rollback fails or causes issues:
- Check ElevenLabs dashboard for agent status
- Use backup files to manually restore configurations
- Contact ElevenLabs support if system tool issues persist