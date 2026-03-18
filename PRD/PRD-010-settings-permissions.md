# PRD-010 — Settings Page & Permission Management
**Version:** 1.1
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-001, PRD-009, PRD-013
**Blocks:** —
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
-->

## ⚠️ LLM INSTRUCTION
The settings page uses a hub layout at `/settings` with a left sidebar and right content area (URL-based routing).
Each section is a separate page under `/settings/{section}`.
User management data comes from PRD-001 (`user_profiles` table). Do not duplicate table definitions here.
Permission matrix is display-only for non-admins. Only Admin can modify permissions.
Theme settings are driven by PRD-009 (UI Design System). Implement using `next-themes` as defined there.
SMTP/Integrations implementation details are in PRD-013. Do not duplicate DB schema here.
Interface dependencies are declared in the INTERFACE_DEPS block above. If PRD-000 version changes, update this block or `validate:prd` will fail.

---

## 1. Purpose

Provide a centralized settings area where users manage their profile, account security, and (for admins) system-wide user permissions and appearance preferences.

Route: `/settings`
Access: All authenticated roles (tab visibility varies by role — see Section 3)

---

## 2. Page Layout

Hub layout: left sidebar navigation + right content area. Active section highlighted in sidebar.
URL-based routing — each section is a separate Next.js page.

```
/settings                     → redirects to /settings/appearance
/settings/appearance          → All roles
/settings/profile             → All roles (own profile only)
/settings/account             → All roles (own account only)
/settings/users               → Admin only
/settings/integrations        → Admin only (SMTP)
```

Sidebar sections:
- **USER:** Appearance, Profile, Account
- **ADMIN** (shown only to admin): Users, Integrations

On mobile: sidebar collapses to top nav or drawer.

---

## 3. Tab: Appearance

**Accessible by:** All authenticated roles

```
┌────────────────────────────────────────┐
│  Theme                                 │
│  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │ Light  │  │  Dark  │  │ System │   │
│  │  ☀️    │  │   🌙   │  │  🖥️   │   │
│  └────────┘  └────────┘  └────────┘   │
│  ● System (current)                    │
└────────────────────────────────────────┘
```

- Visual cards with preview (not just radio buttons)
- Selected card has `border-primary ring-2` highlight
- Preference saved via `next-themes` (localStorage) immediately on click
- No "Save" button needed — immediate effect

---

## 4. Tab: Profile

**Accessible by:** All authenticated roles (own profile only)

| Field | Editable | Notes |
|-------|----------|-------|
| Full name | Yes | Max 100 chars |
| Email | No | Changed only by Admin via PRD-001 |
| Role | No | Read-only display |
| Avatar | Yes | Upload to Supabase Storage, max 2MB, jpg/png/webp |
| Team | No | Read-only, always "horuseye-team" |

```typescript
// Avatar upload
// Bucket: 'avatars' (private, served via signed URL)
// Path:   avatars/{user_id}/avatar.{ext}
// On upload: update user_profiles.avatar_url with signed URL
// Image is displayed via Avatar component (PRD-009)
```

**Save button:** Visible, updates `user_profiles` via server action.
**Success:** toast `"Profile updated successfully."`
**Error:** toast with error detail (PRD-006 standard).

---

## 5. Tab: Account

**Accessible by:** All authenticated roles

### 5.1 Change Password

```
Current password:  [____________]
New password:      [____________]  (min 8 chars, 1 uppercase, 1 number)
Confirm password:  [____________]
                              [Change Password]
```

Uses Supabase Auth `updateUser({ password })`.
After change: all other sessions are invalidated (Supabase default behavior).
Logs: `auth.password_reset` event → `audit_logs`.

### 5.2 Active Sessions

```
Active Sessions (3):
┌─────────────────────────────────────────────────────┐
│  Chrome · macOS    Istanbul, TR    Current session   │
│  Safari · iOS      Istanbul, TR    2 days ago   [X]  │
│  Chrome · Windows  Ankara, TR      5 days ago   [X]  │
└─────────────────────────────────────────────────────┘
                                [Sign out all other sessions]
```

- Session data from Supabase Auth admin API
- Each row: browser, OS, location (from IP), last active
- [X] button: terminates that specific session
- "Sign out all other sessions" button: terminates all except current

---

## 6. Tab: Users & Permissions

**Accessible by:** Admin only (tab is hidden from other roles via role check in component)

### 6.1 User List

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Search users...]                          [+ Add User]               │
│                                                                         │
│  Name               Email                 Role        Status   Actions │
│  ─────────────────────────────────────────────────────────────────────│
│  Taha Öztürk        taha@horuseye.com     Admin       Active   [...]   │
│  Gizem İpek         gizem@horuseye.com    Supervisor  Active   [...]   │
│  Çağla Abazaoğlu    cagla@horuseye.com    Assistant   Active   [...]   │
│  Ali Sahil          ali@horuseye.com      Supervisor  Inactive [...]   │
└────────────────────────────────────────────────────────────────────────┘
```

Columns: Full name, Email, Role badge, Active/Inactive badge, Actions (`DropdownMenu`).
Actions per user: Edit role, Activate/Deactivate, Send password reset, Delete (soft).
Pagination: 20 per page, shadcn `Pagination`.
Search: debounced, searches name + email.

### 6.2 Permission Matrix Table

Displays what each role can do across the system. **Checkboxes reflect current RBAC policy — they are not manually editable per-user.** Role change (via user list above) automatically updates all permissions.

```
                          admin   supervisor   assistant   guest
─────────────────────────────────────────────────────────────────
View public documents       ✓         ✓            ✓          ✓
View dashboard              ✓         ✓            ✓          —
View files                  ✓         —            —          —
Upload files                ✓         —            —          —
Delete files                ✓         —            —          —
Write feedback              ✓         ✓            —          —
View feedback               ✓         ✓            ✓          —
Resolve feedback            ✓         ✓            —          —
Manage users                ✓         —            —          —
View monitor dashboard      ✓         —            —          —
View audit logs             ✓         —            —          —
```

Implementation: static table, rendered from a `PERMISSION_MATRIX` constant (not from DB).
Checkboxes are disabled (read-only display). Changes require a role change for the user.

```typescript
// constants/permissions.ts
export const PERMISSION_MATRIX = {
  'view_public_docs':    { admin: true,  supervisor: true,  assistant: true,  guest: true  },
  'view_dashboard':      { admin: true,  supervisor: true,  assistant: true,  guest: false },
  'manage_files':        { admin: true,  supervisor: false, assistant: false, guest: false },
  'write_feedback':      { admin: true,  supervisor: true,  assistant: false, guest: false },
  'manage_users':        { admin: true,  supervisor: false, assistant: false, guest: false },
  'view_monitor':        { admin: true,  supervisor: false, assistant: false, guest: false },
} as const;
```

### 6.3 Add User Dialog

Opens a `Dialog` (shadcn):
```
Add New User
├── Full Name:   [_______________]
├── Email:       [_______________]
├── Role:        [Select role ▼]  (supervisor | assistant only — cannot create admin via UI)
└──                    [Cancel]  [Send Invite]
```

Creates Supabase Auth user + `user_profiles` row + sends welcome email.
Admin cannot create another admin via this dialog (must be done via Supabase dashboard / direct DB).

---

## 7. Section: Integrations (Admin only)

**Route:** `/settings/integrations`
**Accessible by:** Admin only

SMTP configuration panel for the email notification system (see PRD-013 for full spec).

```
┌─────────────────────────────────────────────────────┐
│  Email (SMTP)                    ● Connected  [Test] │
│                                                      │
│  SERVER                                              │
│  Host: [smtp.hostinger.com    ]  Port: [465]  TLS ✓  │
│                                                      │
│  AUTHENTICATION                                      │
│  Username: [info@horuseye.app ]                      │
│  Password: [●●●●●●●●●●●●●●●● ]                       │
│                                                      │
│  SENDER                                              │
│  From name:  [HorusEye        ]                      │
│  From email: [info@horuseye.app]                     │
│                                                      │
│  NOTIFICATIONS                                       │
│  Admin email: [taha@horuseye.app]                    │
│                                                      │
│                              [Save Settings]         │
└─────────────────────────────────────────────────────┘
```

- Password is stored AES-256-GCM encrypted in `smtp_settings` table
- "Test Connection" sends a `VERIFY` command to the SMTP server (no email sent)
- Connection status badge: `not_configured` | `connected` | `error`
- Only one SMTP configuration exists system-wide (singleton row, id=1)

---

## 8. Supabase MCP Integration

All user management writes must use MCP where possible.
MCP project name: **`horuseye-staging`**

- Read `user_profiles` list: MCP `execute_sql`
- Update user role: MCP `execute_sql` (UPDATE)
- Soft delete user: MCP `execute_sql` (UPDATE deleted_at)
- Avatar upload: Supabase Storage (direct client, MCP does not support storage)
- Create new auth user: Supabase Admin API (server action, service_role)

---

## 9. Test Scenarios

- [ ] Appearance tab: clicking "Dark" switches theme immediately, no save needed
- [ ] Profile tab: update full name → saved → topbar avatar name updates
- [ ] Profile tab: upload avatar → preview shows new image
- [ ] Profile tab: email field is read-only (input disabled)
- [ ] Account tab: change password → success → other sessions invalidated
- [ ] Account tab: terminate single session → that session is gone from list
- [ ] Users tab (admin): visible to admin, hidden to supervisor/assistant
- [ ] Users tab: search filters by name and email
- [ ] Users tab: change role → permission matrix reflects new permissions immediately
- [ ] Users tab: deactivate user → user cannot login (Supabase disables account)
- [ ] Add User dialog: cannot select "admin" in role dropdown
- [ ] Add User: sends welcome email
- [ ] Permission matrix: all checkboxes are disabled (display-only)
- [ ] Integrations tab: visible to admin, hidden from other roles
- [ ] Save SMTP: password encrypted in DB, plain value never stored
- [ ] Test Connection: returns success/error badge without sending email
- [ ] SMTP not configured: notification events fail silently (fire-and-forget)
