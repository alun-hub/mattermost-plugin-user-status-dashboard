# User Status Dashboard

A Mattermost plugin that adds a right-hand sidebar panel for monitoring the status of selected users in real time.

## Features

- **Watch list** — pick any Mattermost users (or import from custom groups) and see their online/offline/away/DND status at a glance.
- **Real-time updates** — status changes arrive instantly via WebSocket (`status_change` events), no polling delay.
- **Custom status** — shows custom status text and emoji for each watched user.
- **Last activity** — displays when a user was last active.
- **Drag and drop** — reorder users within sections or move them between folders with smooth drag-and-drop:
  - Flicker-free highlighting using a drag-enter counter pattern.
  - Full-section drop targets with background tint and left-border accent.
  - Insertion line between rows for precise ordering.
  - Auto-expand collapsed folders after hovering for 500 ms.
  - Visual feedback: dragged row dims to 40 % opacity and cursor changes to grabbing.

## Requirements

- Mattermost Server **9.8+** (uses `GetUsersByIds` plugin API, introduced in 9.8)
- Go 1.21+
- Node.js 18+ / npm

## Building

```bash
make dist
```

The distributable tarball is written to `dist/com.github.alun.user-status-dashboard-0.1.0.tar.gz`.

## Installation

Upload the tarball through **System Console > Plugins > Upload Plugin**, or deploy with:

```bash
export MM_SERVICESETTINGS_SITEURL=https://your-mattermost.example.com
export MM_ADMIN_TOKEN=your-admin-token
make deploy
```

## Usage

1. Click the **Status Dashboard** icon in the channel header to open the sidebar panel.
2. Press **+ Add** to search for users or import members from a custom group.
3. Status updates appear in real time. A fallback poll runs every 5 minutes to catch custom-status changes (which lack a dedicated WebSocket event).

## Architecture

```
server/
  api.go          REST API handlers (/api/v1/statuses, /watched-users, /groups)
  plugin.go       Plugin lifecycle (OnActivate, ServeHTTP)

webapp/
  src/
    index.tsx                  Plugin entry point, WebSocket event bridge
    components/
      sidebar_panel.tsx        Main RHS panel with WS-driven status updates
      user_selector.tsx        User/group search and add dialog
      user_status_row.tsx      Single user row rendering
    types.ts                   Shared TypeScript types
```

### Server: Batch API calls

The `/api/v1/statuses` endpoint resolves all watched users in two bulk API calls:

1. `GetUserStatusesByIds(ids)` — online/offline/away/DND + last activity
2. `GetUsersByIds(ids)` — username, name, nickname, custom status

### Webapp: WebSocket event bridge

The plugin registers Mattermost WebSocket handlers in `index.tsx` that relay events to the sidebar panel via DOM `CustomEvent`s:

| WS event | CustomEvent | Effect |
|---|---|---|
| `status_change` | `status_dashboard_status_change` | Updates single user status in-place |
| reconnect | `status_dashboard_reconnect` | Full refresh from server |

## Development

```bash
# Build server only
make server

# Build webapp only
make webapp

# Run Go tests
make test

# Clean all build artifacts
make clean
```

## License

See repository for license details.
