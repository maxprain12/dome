import ManyCredentials from './ManyCredentials';

/** What a Many may use beyond its own library: saved sign-ins now, skills and connections next. */
export default function ManyAccess({ manyId }: { manyId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ManyCredentials manyId={manyId} />
    </div>
  );
}
