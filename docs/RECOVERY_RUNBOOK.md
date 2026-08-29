# Recovery Runbook — Account Command Center

Plain-language steps for the person operating the portal. No code required.
Everything below is done from **Settings → Backup & Recovery** unless stated.

---

## 1. Something is applying changes it should not be

1. Settings → Backup & Recovery → **Stop everything**.
2. Nothing can be applied after that. Preparing and previewing still work, so you
   can see what *would* have happened.
3. The stop survives a reload and a crash. It stays on until an admin turns it back on.
4. When the cause is understood, choose **Safe mode** (only low-risk, reversible
   changes) before going back to **Resume normal**.

Expected time: under 1 minute.

## 2. A change says "needs checking" or "not confirmed"

The portal never claims a change landed when it cannot prove it.

1. Open the **Action Center**.
2. Anything under "needing you" was either not applied, only partly applied, or
   could not be verified.
3. Check the source system by hand, then use the offered compensation step if one
   is shown. Do not re-run the change blindly — re-running is only offered where
   it is safe to repeat.

## 3. The portal says work is saved on this device only

1. Settings → Backup & Recovery → **Cloud save status** lists the affected areas.
2. Do **not** clear browser data, sign out, or move to another device.
3. Click **Download backup** immediately. That file is a full copy of your work.
4. Sign out and back in. Sync resumes automatically on a fresh session.
5. If the warning stays, keep working — nothing is lost locally — and restore the
   backup on a healthy device later.

## 4. You were signed out mid-shift

1. Sign back in. The portal reloads your work from the cloud.
2. Compare against what you remember doing in the last few minutes; only changes
   made after the last successful cloud save can be missing.
3. If the cloud copy looks older than your device copy, do **not** keep working —
   restore your most recent downloaded backup first.

## 5. Restoring a backup

1. Settings → Backup & Recovery → **Restore from backup**.
2. The file is checked before anything is written. A damaged, edited, truncated or
   foreign file is refused outright — nothing is partially restored.
3. Confirm. A safety copy of the current device state is taken first.
4. The page reloads automatically when the restore finishes.
5. If the restore cannot finish, the portal puts the device back the way it was and
   tells you so.

## 6. A source system (Freshdesk / Amtelco) is down

Nothing to do. Changes to that system are refused rather than half-applied, and the
Action Center shows the outage as the reason. Retry when the system is back.

## 7. Someone's access was removed

Their permission is re-checked at the moment a change is applied, not when it was
prepared. A previously approved change from a revoked account will be refused.

## 8. Routine hygiene

- Download a backup at the end of each week, and before any large clean-up.
- Store backups where the rest of your work records live. They contain operational
  work notes — treat them like any other internal record.
- Signing out wipes this device's local copy by design. Take the backup first.
