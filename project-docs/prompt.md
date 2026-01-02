# Product Requirements Document (PRD)

## **Project Name: Workday (Working Title)**

*A Lightweight Daily Planning & Visibility Platform for Workplaces*

---

## 1. Overview

### 1.1 Purpose

Workday is a **simple daily planning and work visibility tool** designed for teams and organizations. It allows workers to plan their day, log work, and reflect, while giving supervisors visibility to engage, support, and guide — **without micromanagement**.

The system emphasizes:

* Clarity
* Accountability
* Simplicity
* Human-centered oversight

---

### 1.2 Target Users

#### Primary Users

* Knowledge workers
* Field staff
* Administrative staff
* Technicians

#### Secondary Users

* Supervisors
* Team leads
* Managers

---

### 1.3 Core Philosophy

* **Not project management**
* **Not time tracking**
* **Not surveillance**
* **Light structure → better outcomes**

---

## 2. Key Concepts

### 2.1 Workspace

A workspace represents an organization or personal environment.

Types:

* `personal`
* `organization`

---

### 2.2 Roles

| Role         | Description                                 |
| ------------ | ------------------------------------------- |
| `member`     | Can create and manage their own daily plans |
| `supervisor` | Can view team plans and leave comments      |
| `admin`      | Manages workspace and users                 |

---

### 2.3 Daily Plan

A daily plan represents a user’s intended work for a single day.

Key characteristics:

* One plan per user per day
* Editable throughout the day
* Contains tasks and reflections

---

### 2.4 Tasks

A task is a lightweight work item.

Key principles:

* Not hierarchical
* No dependencies
* Simple status lifecycle

---

### 2.5 Reflections

Used for:

* End-of-day feedback
* Self-awareness
* Supervisor insight

---

## 3. Functional Requirements

---

## 3.1 Authentication & Access Control

### Functional Requirements

* Email/password authentication
* Workspace-based authorization
* Role-based permissions

### Non-functional

* Secure password hashing
* JWT-based sessions

---

## 3.2 Workspace Management

### Features

* Create workspace
* Invite users via email
* Assign roles
* Switch between workspaces

---

## 3.3 Daily Planning (Core Feature)

### User Flow

1. User opens “Today”
2. Adds tasks
3. Marks tasks as completed
4. Adds reflections
5. Submits day

---

### Daily Plan Fields

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "workspace_id": "uuid",
  "date": "YYYY-MM-DD",
  "visibility": "team | private",
  "submitted": true
}
```

---

## 3.4 Task Management

### Task Fields

```json
{
  "id": "uuid",
  "daily_plan_id": "uuid",
  "title": "string",
  "category": "Admin | Technical | Field | Other",
  "estimated_minutes": 30,
  "actual_minutes": 45,
  "status": "planned | done | skipped",
  "notes": "optional"
}
```

---

### Task Rules

* Tasks are orderable
* Tasks are editable until day is closed
* Estimated time is optional
* No task dependencies

---

## 3.5 Reflection System

Each daily plan includes:

```json
{
  "what_went_well": "string",
  "blockers": "string",
  "tomorrow_focus": "string"
}
```

---

## 3.6 Supervisor View

### Features

* View team members’ daily plans
* Filter by date
* See completion state
* Comment on plans
* Add encouragement or guidance

---

### Supervisor Permissions

* Cannot edit user tasks
* Can add comments
* Can mark plan as reviewed

---

## 3.7 Comments & Engagement

```json
{
  "id": "uuid",
  "author_id": "uuid",
  "daily_plan_id": "uuid",
  "content": "string",
  "created_at": "timestamp"
}
```

---

## 3.8 Notifications (Phase 2)

* Daily reminder to plan
* Supervisor comment notification
* Optional push notifications

---

## 4. UI / UX Requirements

---

### 4.1 Layout

#### Desktop

* Left: Navigation (Workspaces, Views)
* Center: Daily Plan
* Right: Comments / Summary

#### Mobile

* Single-column
* Bottom navigation
* Swipe interactions

---

### 4.2 Views

#### Worker Views

* Today
* History
* My Profile

#### Supervisor Views

* Team Overview
* Member Detail
* Daily Activity Feed

---

### 4.3 Visual Design

* Minimal
* Calm colors
* Clear hierarchy
* Accessibility-first (WCAG AA)

---

## 5. Non-Functional Requirements

### Performance

* Page load < 2s
* API response < 300ms

### Reliability

* 99.9% uptime target

### Security

* Encrypted at rest and in transit
* Role-based access control

### Scalability

* Designed for 10 → 10,000 users per org

---

## 6. Technical Architecture

---

### 6.1 Full Stack App

**Stack**

* Next.js (App Router)
* Tailwind CSS
* ShadCN UI
* React Query
* sqlite



---

## 7. Database Schema (Simplified)

```sql
User(id, email, password_hash, name)

Workspace(id, name, type)

Membership(id, user_id, workspace_id, role)

DailyPlan(id, user_id, workspace_id, date, visibility, submitted)

Task(id, daily_plan_id, title, category, status, est_minutes, actual_minutes)

Reflection(id, daily_plan_id, what_went_well, blockers, tomorrow_focus)

Comment(id, daily_plan_id, author_id, content)
```

---

## 8. API Endpoints (High-Level)

### Auth

* POST /auth/login
* POST /auth/register

### Workspaces

* GET /workspaces
* POST /workspaces

### Daily Plans

* GET /plans?date=
* POST /plans
* PUT /plans/{id}

### Tasks

* POST /tasks
* PUT /tasks/{id}
* DELETE /tasks/{id}

### Comments

* POST /comments
* GET /plans/{id}/comments

---

## 9. MVP Scope (Strict)

✅ Auth
✅ Workspace
✅ Daily planning
✅ Supervisor visibility
✅ Comments

❌ Analytics
❌ Notifications
❌ Integrations

---

## 10. Future Enhancements

* Weekly summaries
* AI insights
* Burnout detection
* Calendar integration
* Time suggestions

---

## 11. Success Metrics

* Daily active users
* % of users completing daily plans
* Supervisor engagement rate
* Retention after 30 days

---

## 12. Open Questions (For Later)

* Anonymous feedback?
* Private vs team visibility?
* Multi-team membership?

---

## 13. Deliverables for AI Agent

The LLM should:

1. Generate full stack nextjs 16.1.1 application
3. Implement auth & RBAC
4. Add seed data
5. Ensure responsiveness
6. Write minimal documentation

---

## 14. Guiding Principle

> **“Make work visible without making people feel watched.”**

---

