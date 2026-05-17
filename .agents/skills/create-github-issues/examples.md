# Orion Issue Examples

## New Feature (backlog)

**Title:** StatusBar initial Implementation  
**Labels:** backlog, new-feature

```markdown
# StatusBar initial Implementation

Status: Backlog
Component: StatusBar
Type: New Feature

Implement a status bar at the bottom right corner of the editor

- Notifications
- Problems & Warnings

---

- **Component**: StatusBar
```

## New Feature (not started)

**Title:** File Node Actions  
**Labels:** new-feature, not-started

```markdown
# File Node Actions

Status: Not started
Component: LeftSidebar
Feature: File System
Type: New Feature
Child Component: FileTree

- New folder
- New file
- Delete file/folder
- Pin file/folder
- Expandable section for pinned items

---

- **Component**: LeftSidebar
- **Child Component**: FileTree
- **Feature**: File System
```

## Bug

**Title:** Sizing the tabs lagging  
**Labels:** bug, not-started

```markdown
# Sizing the tabs lagging

Status: Not started
Type: Bug Fix

When the user resizes the tab and a huge notebook with lots of images and tables is open, the UI starts reducing the refresh rate of the screen.
```

## Refactor

**Title:** Watch external file edits  
**Labels:** Refactor, not-started

```markdown
# Watch external file edits

Status: Not started
Component: Editor, NotebookEditor
Feature: Diffs
Type: New Feature
Child Component: MonacoEditor

When an edit to a opened file is made by an external source (like another editor, a CLI, etc) the Editor component (Both the MonacoEditor and the NotebookEditor) must show a diff produced by the external source and a indication (probably in the editor toolbar) to inform the user that a change has been detected

---

- **Component**: Editor
- **Child Component**: MonacoEditor
- **Feature**: NotebookEditor
```

## In Progress

**Title:** Profiler insights  
**Labels:** in-progress, new-feature

```markdown
# Profiler insights

Status: In progress
Component: NotebookCell
Feature: Profiler
Type: New Feature

---

- **Component**: NotebookCell
- **Feature**: Profiler
```
