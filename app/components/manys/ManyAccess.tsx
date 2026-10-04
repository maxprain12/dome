import ManyCredentials from './ManyCredentials';
import ManySkills from './ManySkills';
import ManyConnections from './ManyConnections';

/** What a Many may use beyond its own library: saved sign-ins, skills and connected services. */
export default function ManyAccess({ manyId }: { manyId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ManyConnections manyId={manyId} />
      <div className="h-px bg-[var(--hairline)]" />
      <ManySkills manyId={manyId} />
      <div className="h-px bg-[var(--hairline)]" />
      <ManyCredentials manyId={manyId} />
    </div>
  );
}
