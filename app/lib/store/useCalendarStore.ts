import { create } from 'zustand';

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  calendar_title?: string;
  calendar_color?: string;
  title: string;
  description?: string;
  location?: string;
  start_at: number;
  end_at: number;
  timezone?: string;
  all_day: boolean;
  status: string;
  reminders?: Array<{ minutes: number }>;
  metadata?: Record<string, unknown>;
  source: string;
  created_at: number;
  updated_at: number;
}

export type CalendarViewMode = 'month' | 'week' | 'day';

interface CalendarState {
  events: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  upcomingUnreadCount: number;
  currentDate: Date;
  viewMode: CalendarViewMode;
  selectedEventId: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncAt: number | null;
  setEvents: (events: CalendarEvent[]) => void;
  setUpcomingEvents: (events: CalendarEvent[]) => void;
  clearUpcomingUnread: () => void;
  setCurrentDate: (date: Date) => void;
  setViewMode: (mode: CalendarViewMode) => void;
  setSelectedEventId: (id: string | null) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
  setLastSyncAt: (ts: number | null) => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  events: [],
  upcomingEvents: [],
  upcomingUnreadCount: 0,
  currentDate: new Date(),
  viewMode: 'month',
  selectedEventId: null,
  syncStatus: 'idle',
  lastSyncAt: null,

  setEvents: (events) => set({ events }),
  setUpcomingEvents: (events) =>
    set({ upcomingEvents: events, upcomingUnreadCount: events.length }),
  clearUpcomingUnread: () => set({ upcomingUnreadCount: 0 }),
  setCurrentDate: (date) => set({ currentDate: date }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
}));
