import ManyCredentials from './ManyCredentials';

/** Saved sign-ins a Many can use without ever seeing them. */
export default function ManyAccess({ manyId }: { manyId: string }) {
  return <ManyCredentials manyId={manyId} />;
}
