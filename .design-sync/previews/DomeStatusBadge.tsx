import { DomeStatusBadge } from 'dome';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16 }}>{children}</div>
);

export const RunStatuses = () => (
  <Row>
    <DomeStatusBadge status="running" />
    <DomeStatusBadge status="queued" />
    <DomeStatusBadge status="waiting_approval" />
    <DomeStatusBadge status="completed" />
    <DomeStatusBadge status="failed" />
    <DomeStatusBadge status="cancelled" />
  </Row>
);
