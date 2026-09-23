import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkBoard, type WorkItem } from "./work-board";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const item: WorkItem = {
  id: "ch_asg_example", title: "Call the lead", objective: "Confirm the need",
  dueAt: "2026-09-23T13:00:00.000Z", priority: "high",
  expectedOutcome: "Qualified conversation", evidenceRequired: true,
  assigneeDisplayName: "Alex", completion: null,
};
const props = { organizationId: "ch_org_example", candidates: [], canManage: false, view: "mine" as const, todayEndIso: "2026-09-23T23:59:59.999Z", offset: 0, nextOffset: null };

it("shows an assignee's due work and required evidence action", () => {
  const html = renderToStaticMarkup(<WorkBoard {...props} items={[item]} />);
  expect(html).toContain("Call the lead");
  expect(html).toContain("Qualified conversation");
  expect(html).toContain("Evidence (required)");
  expect(html).toContain("Report complete");
  expect(html).toContain("UTC");
});

it("labels a submitted result as reported rather than verified", () => {
  const completed = { ...item, completion: { outcome: "Talked to lead", evidence: "Call notes", completedAt: "2026-09-23T14:00:00.000Z" } };
  const html = renderToStaticMarkup(<WorkBoard {...props} items={[completed]} />);
  expect(html).toContain("Reported complete");
  expect(html).toContain("Call notes");
  expect(html).not.toContain("Report complete</button>");
  expect(html).not.toContain("Verified");
});

it("shows scoped manager assignment controls and honest empty states", () => {
  const html = renderToStaticMarkup(<WorkBoard {...props} view="team" canManage candidates={[]} items={[]} />);
  expect(html).toContain("Assign work");
  expect(html).toContain("No active members are available");
  expect(html).toContain("No upcoming assignments");
});
