import { create } from 'zustand';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { OutlineItem } from '@/lib/pdf/pdf-loader';
import type { PDFAnnotation } from '@/lib/pdf/annotation-utils';

export interface PDFViewerState {
  currentPage: number;
  totalPages: number;
  outline: OutlineItem[];
  pages: PDFPageProxy[];
  annotations: PDFAnnotation[];
  zoom: number;
  activeTool: 'highlight' | 'note' | null;
  color: string;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onAddNote: (pageIndex: number) => void;
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onToolSelect: (tool: 'highlight' | 'note' | null) => void;
  onColorChange: (color: string) => void;
}

interface PDFViewerStore {
  pdfState: PDFViewerState | null;
  setPdfState: (state: PDFViewerState | null) => void;
}

export const usePDFViewerStore = create<PDFViewerStore>((set) => ({
  pdfState: null,
  setPdfState: (state) => set({ pdfState: state }),
}));
