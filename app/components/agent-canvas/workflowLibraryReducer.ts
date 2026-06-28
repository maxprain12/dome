import type { CanvasWorkflow } from '@/types/canvas';
import type { DomeWorkflowFolder } from '@/types';

export interface WorkflowLibraryState {
  workflows: CanvasWorkflow[];
  folders: DomeWorkflowFolder[];
  deletingId: string | null;
  search: string;
  expanded: Set<string>;
  dragOverFolderId: string | 'root' | null;
  deleteFolderTarget: DomeWorkflowFolder | null;
  importingBundle: boolean;
}

export type WorkflowLibraryAction =
  | { type: 'SET_LIST'; workflows: CanvasWorkflow[]; folders: DomeWorkflowFolder[] }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_DELETING'; id: string | null }
  | { type: 'REMOVE_WORKFLOW'; id: string }
  | { type: 'UPDATE_WORKFLOW'; workflow: CanvasWorkflow }
  | { type: 'ADD_FOLDER'; folder: DomeWorkflowFolder }
  | { type: 'UPDATE_FOLDER_NAME'; id: string; name: string }
  | { type: 'TOGGLE_EXPAND'; id: string }
  | { type: 'EXPAND_ALL'; ids: string[] }
  | { type: 'SET_DRAG_OVER'; id: string | 'root' | null }
  | { type: 'SET_DELETE_FOLDER_TARGET'; folder: DomeWorkflowFolder | null }
  | { type: 'SET_IMPORTING'; importing: boolean };

export const initialWorkflowLibraryState: WorkflowLibraryState = {
  workflows: [],
  folders: [],
  deletingId: null,
  search: '',
  expanded: new Set(),
  dragOverFolderId: null,
  deleteFolderTarget: null,
  importingBundle: false,
};

export function workflowLibraryReducer(
  state: WorkflowLibraryState,
  action: WorkflowLibraryAction,
): WorkflowLibraryState {
  switch (action.type) {
    case 'SET_LIST':
      return {
        ...state,
        workflows: action.workflows,
        folders: action.folders,
        expanded: new Set([...state.expanded, ...action.folders.map((f) => f.id)]),
      };
    case 'SET_SEARCH':
      return { ...state, search: action.search };
    case 'SET_DELETING':
      return { ...state, deletingId: action.id };
    case 'REMOVE_WORKFLOW':
      return { ...state, workflows: state.workflows.filter((w) => w.id !== action.id) };
    case 'UPDATE_WORKFLOW':
      return {
        ...state,
        workflows: state.workflows.map((w) => (w.id === action.workflow.id ? action.workflow : w)),
      };
    case 'ADD_FOLDER':
      return {
        ...state,
        folders: [...state.folders, action.folder],
        expanded: new Set(state.expanded).add(action.folder.id),
      };
    case 'UPDATE_FOLDER_NAME':
      return {
        ...state,
        folders: state.folders.map((f) => (f.id === action.id ? { ...f, name: action.name } : f)),
      };
    case 'TOGGLE_EXPAND': {
      const next = new Set(state.expanded);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, expanded: next };
    }
    case 'EXPAND_ALL':
      return { ...state, expanded: new Set([...state.expanded, ...action.ids]) };
    case 'SET_DRAG_OVER':
      return { ...state, dragOverFolderId: action.id };
    case 'SET_DELETE_FOLDER_TARGET':
      return { ...state, deleteFolderTarget: action.folder };
    case 'SET_IMPORTING':
      return { ...state, importingBundle: action.importing };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
