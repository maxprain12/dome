import WorkspaceClientWrapper from './wrapper';

// For optional catch-all routes with static export, return empty to allow base path
export function generateStaticParams() {
  return [{ params: [] }];
}

export default function WorkspacePage() {
  return <WorkspaceClientWrapper />;
}
