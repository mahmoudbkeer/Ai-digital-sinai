import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { initialNotifications, initialRequests, type AppNotification, type RequestItem, type RoleKey } from "@/lib/demo-data";

type AppStateContextValue = {
  role: RoleKey;
  spaceId: string;
  requests: RequestItem[];
  notifications: AppNotification[];
  isHydrated: boolean;
  setRole: (role: RoleKey) => void;
  setSpaceId: (spaceId: string) => void;
  addRequest: (request: RequestItem) => void;
  addNotification: (notification: AppNotification) => void;
  updateRequestStatus: (id: string, status: RequestItem["status"]) => void;
  markNotificationRead: (id: string) => void;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);
const STORAGE_KEY = "ai-digital-sinai.mobile-state.v1";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<RoleKey>("consumer");
  const [spaceId, setSpaceIdState] = useState("space-1");
  const [requests, setRequests] = useState<RequestItem[]>(initialRequests);
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<{ role: RoleKey; spaceId: string; requests: RequestItem[]; notifications: AppNotification[] }>;
          if (parsed.role === "consumer" || parsed.role === "merchant" || parsed.role === "admin") setRoleState(parsed.role);
          if (typeof parsed.spaceId === "string") setSpaceIdState(parsed.spaceId);
          if (Array.isArray(parsed.requests)) setRequests(parsed.requests);
          if (Array.isArray(parsed.notifications)) setNotifications(parsed.notifications);
        } catch {
          // A corrupt local state should never block the user from opening the app.
        }
      })
      .finally(() => {
        if (mounted) setIsHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ role, spaceId, requests, notifications }));
  }, [isHydrated, notifications, requests, role, spaceId]);

  const value = useMemo<AppStateContextValue>(() => ({
    role,
    spaceId,
    requests,
    notifications,
    isHydrated,
    setRole: setRoleState,
    setSpaceId: setSpaceIdState,
    addRequest: (request) => setRequests((current) => [request, ...current]),
    addNotification: (notification) => setNotifications((current) => [notification, ...current]),
    updateRequestStatus: (id, status) => setRequests((current) => current.map((item) => item.id === id ? { ...item, status } : item)),
    markNotificationRead: (id) => setNotifications((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item)),
  }), [isHydrated, notifications, requests, role, spaceId]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}
