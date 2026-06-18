import { HubBentoCard, HubEntityIcon, DomeBadge } from 'dome';

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(200px, 1fr))', gap: 12, padding: 16, maxWidth: 520 }}>{children}</div>
);

export const Default = () => (
  <Grid>
    <HubBentoCard icon={<HubEntityIcon kind="agent" />} title="Tutor de Cálculo" subtitle="Responde dudas y genera ejercicios" meta="Usado hoy" />
    <HubBentoCard icon={<HubEntityIcon kind="workflow" />} title="Resumen semanal" subtitle="3 pasos · programado" trailing={<DomeBadge label="Activo" color="#16a34a" variant="soft" dot />} />
  </Grid>
);

export const Selected = () => (
  <Grid>
    <HubBentoCard icon={<HubEntityIcon kind="feeder" />} title="Blog de Matemáticas" subtitle="RSS · cada 6 h" selected />
    <HubBentoCard icon={<HubEntityIcon kind="agent" />} title="Corrector de estilo" subtitle="Revisa redacción académica" />
  </Grid>
);
