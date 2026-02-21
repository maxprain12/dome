/**
 * Skeleton for PDF viewer loading state.
 * Mimics toolbar + page area to reduce content jumping and improve perceived load.
 */
export default function PDFViewerSkeleton() {
  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-200 motion-reduce:animate-none">
      {/* Toolbar skeleton */}
      <div
        className="flex items-center gap-4 px-4 py-2 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <div className="skeleton h-9 w-9 rounded-md" />
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton h-9 w-9 rounded-md" />
        <div className="w-px h-5" style={{ background: 'var(--border)' }} />
        <div className="skeleton h-9 w-9 rounded-md" />
        <div className="skeleton h-4 w-12 rounded" />
        <div className="skeleton h-9 w-9 rounded-md" />
      </div>

      {/* Annotation toolbar skeleton */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <div className="skeleton h-9 w-9 rounded-md" />
        <div className="skeleton h-9 w-9 rounded-md" />
      </div>

      {/* Page area skeleton - reserve space to reduce jumping */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-[60vh]">
        <div className="skeleton w-full max-w-[612px] rounded-lg flex-1" style={{ aspectRatio: '8.5 / 11' }} />
      </div>
    </div>
  );
}
