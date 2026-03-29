---
id: dashboard
title: Main Dashboard
persona: sarah-pm
journey: onboarding
status: approved
acceptance_criteria:
  - Must show all active projects with visual progress bars indicating completion percentage
  - Time tracked today displayed prominently in the top section with start/stop controls
  - Overdue tasks highlighted in red with days-overdue count badge
  - Page must load within 2 seconds on 3G connection with skeleton loading states
  - Support both list view and kanban board view with toggle switch
  - Show upcoming deadlines in a sidebar or calendar widget for the next 7 days
  - Quick-add task button accessible from dashboard without navigating to a project
  - Responsive layout that works on mobile devices (minimum 320px viewport)
out_of_scope:
  - Real-time collaboration cursors (planned for v2)
  - Custom dashboard widget arrangement (drag-and-drop layout)
  - Advanced analytics charts (separate analytics page)
  - Integration status indicators (GitHub, Slack)
design_ref: figma.com/file/taskpilot-dashboard-v1
---

## Overview

The main dashboard is the primary landing page after login. It serves as a command center for project managers like Sarah who need to quickly assess the state of all their active projects, track their time, and identify tasks that need immediate attention.

## Layout Structure

The dashboard follows a three-column layout on desktop that collapses to a single column on mobile:

### Top Bar
- Global search bar (Cmd+K shortcut)
- Notification bell with unread count badge
- User avatar with dropdown menu
- Quick-add task button (+ icon)

### Left Column (Main Content - 60%)
- **Active Projects Grid**: Cards showing project name, client name, progress bar (% complete based on tasks done/total), and next deadline. Sorted by nearest deadline first.
- **View Toggle**: Switch between list view (compact rows) and kanban view (columns by status: To Do, In Progress, Review, Done).

### Right Column (Sidebar - 40%)
- **Time Tracker Widget**: Large display showing today's tracked time. One-click start/stop timer. Dropdown to select which project/task to track against. Shows weekly total below.
- **Upcoming Deadlines**: Next 7 days of deadlines in a compact list. Each item shows task name, project, and due date. Red highlight for overdue, yellow for due today.
- **Overdue Tasks**: Separate section listing all overdue tasks across projects. Each shows days overdue as a red badge. Click to navigate directly to the task.

## Interaction Patterns

### Project Cards
- Click to navigate to project detail page
- Hover to show quick actions (archive, add task, view timeline)
- Right-click for context menu with full action list

### Time Tracker
- Single click on play button starts timer for last tracked project
- Timer persists across page navigations (stored in local state + server sync)
- Manual time entry available via clicking the time display

### Keyboard Shortcuts
- `Cmd+K` or `/`: Open global search
- `N`: Quick-add new task
- `T`: Toggle time tracker start/stop
- `1`/`2`: Switch between list and kanban view

## Performance Requirements

- Initial load: < 2 seconds on 3G connection
- Use skeleton loading for project cards (show structure before data)
- Lazy load sidebar widgets after main content
- Virtualize project list if more than 20 projects
- Cache project data with SWR or React Query (stale-while-revalidate)

## Mobile Considerations

Sarah frequently checks the dashboard on her phone between meetings. The mobile layout must:
- Stack columns vertically (time tracker first, then projects, then deadlines)
- Touch-friendly tap targets (minimum 44x44px)
- Swipe to reveal quick actions on project cards
- Sticky time tracker at top of viewport
