"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ConsolePlaceholder.tsx
 * Shared "not yet built" empty state for the 8 Console screens (see
 * console/layout.tsx). One small component instead of duplicating the same
 * Card+Empty markup 8 times — each screen just supplies its own title,
 * docx-sourced description, and icon.
 *
 * Empty size="page" (2026-08-28): this Empty IS the entire route content,
 * not one inset panel among other populated cards — the closest TripAgent
 * equivalent to Jira's whole-tab empty states (an empty Board/Plan), which
 * get the second-biggest text in the app. See design_reference_jira memory.
 * ===========================================================================*/
import { Card, Empty } from "../ui";

export function ConsolePlaceholder({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <Card title={title}>
      <Empty size="page" icon={icon} title="Not yet built" message={description} />
    </Card>
  );
}
