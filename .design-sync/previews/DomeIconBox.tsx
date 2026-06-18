import { DomeIconBox } from 'dome';
import { FileText, Sparkles, FolderOpen } from 'lucide-react';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16 }}>{children}</div>
);

export const Sizes = () => (
  <Row>
    <DomeIconBox size="sm"><FileText size={16} color="var(--accent)" /></DomeIconBox>
    <DomeIconBox size="md"><FileText size={20} color="var(--accent)" /></DomeIconBox>
  </Row>
);

export const Backgrounds = () => (
  <Row>
    <DomeIconBox background="color-mix(in srgb, var(--accent) 16%, transparent)"><Sparkles size={20} color="var(--accent)" /></DomeIconBox>
    <DomeIconBox background="color-mix(in srgb, #16a34a 16%, transparent)"><FolderOpen size={20} color="#16a34a" /></DomeIconBox>
    <DomeIconBox background="color-mix(in srgb, #dc2626 16%, transparent)"><FileText size={20} color="#dc2626" /></DomeIconBox>
  </Row>
);
