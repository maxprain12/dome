---
title: Dome CMS tools for Many
status: active
---

## Goal

Expose the installed Dome CMS plugin to Many so it can inspect entry status, edit drafts and publish a reviewed entry in the configured vault.

## Implementation

- Bundle a fixed, namespaced tool catalog with Dome CMS and declare its tools in the plugin manifest.
- Advertise tools only while the plugin is installed, enabled and configured; route execution through the existing plugin service so vault grants and revision checks remain authoritative.
- Keep list and get read-only; hide mutations in plan mode and require human approval before publishing.
- Allow an installed bundled plugin to update from the marketplace, then require its changed manifest permissions to be reviewed again.

## Validation

Exercise manifest validation, tool visibility and dispatch, approval gating, plan/draft behavior and repository checks.
