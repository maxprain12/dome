import { DomeSkeletonGrid } from 'dome';

export const Default = () => (
  <div style={{ padding: 16, maxWidth: 520 }}>
    <DomeSkeletonGrid count={6} />
  </div>
);

export const Tall = () => (
  <div style={{ padding: 16, maxWidth: 520 }}>
    <DomeSkeletonGrid count={4} cellHeightClass="h-32" />
  </div>
);
