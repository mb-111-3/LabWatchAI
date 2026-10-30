import axios from "axios";

export const API_BASE = "http://localhost:8080/api";
export const WS_URL = "ws://localhost:8080/ws";

export const api = axios.create({ baseURL: API_BASE });

const WATCHDOG_MS = 8000; // server pushes at least every ~3s; if silent this long, assume stale

export function connectWS(onMessage: (type: string, data: any) => void) {
  let ws: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout>;
  let watchdog: ReturnType<typeof setTimeout>;
  let stopped = false;

  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      // no messages recently — connection is likely stale; force a reconnect
      ws?.close();
    }, WATCHDOG_MS);
  }

  function connect() {
    if (stopped) return;
    ws = new WebSocket(WS_URL);
    ws.onopen = () => armWatchdog();
    ws.onmessage = (ev) => {
      armWatchdog();
      try {
        const msg = JSON.parse(ev.data);
        onMessage(msg.type, msg.data);
      } catch {
        // ignore malformed
      }
    };
    ws.onclose = () => {
      clearTimeout(watchdog);
      if (!stopped) retryTimer = setTimeout(connect, 1500);
    };
    ws.onerror = () => ws?.close();
  }
  connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(watchdog);
    ws?.close();
  };
}
