export interface Computer {
  id: string;
  name: string;
  lab: string;
  os: string;
  ip: string;
  status: "available" | "in-use";
  currentUser: string;
  isIdle: boolean;
  lastSeen: string;
}

export interface SessionRec {
  id: string;
  computerId: string;
  name: string;
  rollNumber?: string;
  class?: string;
  batch?: string;
  isGuest: boolean;
  loginTime: string;
  logoutTime?: string;
}

export interface Alert {
  id: string;
  computerId: string;
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  timestamp: string;
}

export interface USBEvent {
  id: string;
  computerId: string;
  deviceName: string;
  vendorId: string;
  serialNo: string;
  action: "connected" | "disconnected" | "blocked";
  timestamp: string;
}

export interface Summary {
  totalComputers: number;
  inUse: number;
  available: number;
  activeSessions: number;
  totalAlerts: number;
  usbEventsToday: number;
}
