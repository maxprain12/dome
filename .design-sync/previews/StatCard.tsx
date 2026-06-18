import { StatCard } from 'dome';
import { FileText, FolderOpen, Sparkles, Clock } from 'lucide-react';

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(150px, 1fr))', gap: 12, padding: 16, maxWidth: 440 }}>{children}</div>
);

export const Default = () => (
  <Grid>
    <StatCard label="Recursos" value={248} icon={FileText} />
    <StatCard label="Proyectos" value={12} icon={FolderOpen} />
    <StatCard label="Resúmenes IA" value={86} icon={Sparkles} />
    <StatCard label="Horas estudiadas" value="42h" icon={Clock} />
  </Grid>
);
