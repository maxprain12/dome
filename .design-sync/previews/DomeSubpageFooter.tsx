import { DomeSubpageFooter, DomeButton } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 560 }}>{children}</div>
);

export const Actions = () => (
  <Wrap>
    <DomeSubpageFooter
      leading={<span style={{ fontSize: 13, color: 'var(--tertiary-text)' }}>Cambios sin guardar</span>}
      trailing={
        <>
          <DomeButton variant="ghost" size="sm">Cancelar</DomeButton>
          <DomeButton variant="primary" size="sm">Guardar cambios</DomeButton>
        </>
      }
    />
  </Wrap>
);

export const Centered = () => (
  <Wrap>
    <DomeSubpageFooter>
      <span style={{ fontSize: 13, color: 'var(--secondary-text)' }}>Mostrando 24 de 24 recursos</span>
    </DomeSubpageFooter>
  </Wrap>
);
