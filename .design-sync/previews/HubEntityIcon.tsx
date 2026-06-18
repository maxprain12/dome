import { HubEntityIcon } from 'dome';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 16 }}>{children}</div>
);

export const Kinds = () => (
  <Row>
    <HubEntityIcon kind="agent" />
    <HubEntityIcon kind="workflow" />
    <HubEntityIcon kind="feeder" />
  </Row>
);

export const Sizes = () => (
  <Row>
    <HubEntityIcon kind="agent" size="sm" />
    <HubEntityIcon kind="agent" size="md" />
  </Row>
);
