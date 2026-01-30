'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import URLViewer from '@/components/viewers/URLViewer';
import type { Resource } from '@/types';

interface URLWorkspaceClientProps {
  resourceId: string;
}

export default function URLWorkspaceClient({ resourceId }: URLWorkspaceClientProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadResource() {
      if (typeof window === 'undefined' || !window.electron?.db?.resources) {
        setError('Electron API not available');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.db.resources.getById(resourceId);
        
        if (result?.success && result.data) {
          // Parse metadata if it's a string
          const resourceData = result.data;
          if (resourceData.metadata && typeof resourceData.metadata === 'string') {
            resourceData.metadata = JSON.parse(resourceData.metadata);
          }
          setResource(resourceData as Resource);
        } else {
          setError(result?.error || 'Resource not found');
        }
      } catch (err) {
        console.error('Error loading resource:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    loadResource();
  }, [resourceId]);

  const handleBack = () => {
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent)' }} />
          <p style={{ color: 'var(--secondary-text)' }}>Loading resource...</p>
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--primary-text)' }}>
            Error
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
            {error || 'Resource not found'}
          </p>
          <button
            onClick={handleBack}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'white',
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-4 border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={handleBack}
          className="p-2 rounded-lg hover:bg-opacity-10 transition-colors"
          style={{ color: 'var(--primary-text)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1" style={{ color: 'var(--primary-text)' }}>
          {resource.title}
        </h1>
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-hidden">
        <URLViewer resource={resource} />
      </div>
    </div>
  );
}
