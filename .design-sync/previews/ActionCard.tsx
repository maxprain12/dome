import { ActionCard } from 'dome';
import { Plus, Upload, Mic, Sparkles } from 'lucide-react';

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: 12, padding: 16, maxWidth: 420 }}>{children}</div>
);

export const Default = () => (
  <Grid>
    <ActionCard label="Nueva nota" icon={Plus} onClick={() => {}} />
    <ActionCard label="Importar archivo" icon={Upload} onClick={() => {}} />
    <ActionCard label="Grabar audio" icon={Mic} onClick={() => {}} />
    <ActionCard label="Preguntar a Many" icon={Sparkles} onClick={() => {}} variant="primary" />
  </Grid>
);
