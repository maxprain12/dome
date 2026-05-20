declare module 'pptx-preview' {
  export function init(
    container: HTMLElement,
    options: { width: number; height: number; mode?: 'slide' | 'list' },
  ): PptxPreviewInstance;
}

interface PptxPreviewInstance {
  preview: (data: ArrayBuffer) => Promise<PptxPreviewInstance & { slideCount: number }>;
  load?: (data: ArrayBuffer) => Promise<PptxPreviewInstance & { slideCount?: number }>;
  renderSingleSlide?: (index: number) => void;
  destroy?: () => void;
  slideCount: number;
  pptx?: {
    themes?: Array<{ clrScheme?: { lt1?: string } }>;
    slides?: unknown[];
  };
}
