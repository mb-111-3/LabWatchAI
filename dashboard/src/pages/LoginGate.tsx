import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Paper, Typography, TextField, Button, ToggleButtonGroup,
  ToggleButton, Alert, Stack, CircularProgress, Chip,
} from "@mui/material";
import ComputerIcon from "@mui/icons-material/DesktopWindows";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { api } from "../api/client";
import type { Computer } from "../types";

const KIOSK_COMPUTER_KEY = "labwatch_kiosk_computer_id";
const HEARTBEAT_INTERVAL_MS = 4000;
const IDLE_THRESHOLD_MS = 15000;

export default function LoginGate() {
  const [computer, setComputer] = useState<Computer | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [klass, setKlass] = useState("");
  const [batch, setBatch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ id: string; loginTime: number } | null>(null);

  useEffect(() => {
    api.get("/computers").then((r) => {
      const list: Computer[] = r.data;
      if (!list.length) return;
      let assignedId = localStorage.getItem(KIOSK_COMPUTER_KEY);
      let assigned = list.find((c) => c.id === assignedId);
      if (!assigned) {
        assigned = list[Math.floor(Math.random() * list.length)];
        localStorage.setItem(KIOSK_COMPUTER_KEY, assigned.id);
      }
      setComputer(assigned);
    });
  }, []);

  const missingFields = useMemo(() => {
    if (!computer) return true;
    if (!name.trim()) return true;
    if (!isGuest && (!rollNumber.trim() || !klass.trim() || !batch.trim())) return true;
    return false;
  }, [computer, name, isGuest, rollNumber, klass, batch]);

  async function handleSubmit() {
    setError("");
    if (missingFields || !computer) {
      setError("Please fill all required fields before proceeding.");
      return;
    }
    setLoading(true);
    try {
      const r = await api.post("/login", {
        computerId: computer.id, isGuest, name, rollNumber, class: klass, batch,
      });
      setSession({ id: r.data.id, loginTime: Date.now() });
    } catch (e: any) {
      setError(e?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (session && computer) {
    return <MonitoredSession sessionId={session.id} computer={computer} name={name} loginTime={session.loginTime}
      onLoggedOut={() => setSession(null)} />;
  }

  return (
    <Box sx={centerBox}>
      <Paper sx={{ p: 4, width: 440 }} elevation={6}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <ComputerIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>LabWatch AI — Access Control</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Identify yourself before using this lab computer.
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">This computer:</Typography>
          {computer ? (
            <Chip size="small" color="primary" label={`${computer.name} — ${computer.lab}`} />
          ) : (
            <Chip size="small" label="Detecting..." />
          )}
        </Stack>

        <ToggleButtonGroup
          exclusive fullWidth value={isGuest} onChange={(_, v) => v !== null && setIsGuest(v)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value={false}>Student</ToggleButton>
          <ToggleButton value={true}>Guest</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          fullWidth required label="Full Name" value={name} onChange={(e) => setName(e.target.value)}
          error={!name.trim()} sx={{ mb: 2 }}
        />

        {!isGuest && (
          <>
            <TextField
              fullWidth required label="Roll Number" value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)} error={!rollNumber.trim()} sx={{ mb: 2 }}
            />
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <TextField
                fullWidth required label="Class" value={klass}
                onChange={(e) => setKlass(e.target.value)} error={!klass.trim()}
              />
              <TextField
                fullWidth required label="Batch" value={batch}
                onChange={(e) => setBatch(e.target.value)} error={!batch.trim()}
              />
            </Stack>
          </>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Button
          fullWidth variant="contained" size="large" onClick={handleSubmit}
          disabled={loading || missingFields}
        >
          {loading ? <CircularProgress size={22} /> : "Continue"}
        </Button>
      </Paper>
    </Box>
  );
}

function MonitoredSession({
  sessionId, computer, name, loginTime, onLoggedOut,
}: { sessionId: string; computer: Computer; name: string; loginTime: number; onLoggedOut: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [idle, setIdle] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // real idle detection from actual mouse/keyboard input on this page
  useEffect(() => {
    function resetIdle() {
      setIdle(false);
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIdle(true), IDLE_THRESHOLD_MS);
    }
    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("keydown", resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("keydown", resetIdle);
      clearTimeout(idleTimer.current);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - loginTime) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [loginTime]);

  useEffect(() => {
    const heartbeat = setInterval(() => {
      api.post(`/sessions/${sessionId}/heartbeat`, { idle }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(heartbeat);
  }, [sessionId, idle]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.post(`/sessions/${sessionId}/logout`, {});
    } finally {
      onLoggedOut();
    }
  }

  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");

  return (
    <Box sx={centerBox}>
      <Paper sx={{ p: 4, width: 460 }} elevation={6}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <FiberManualRecordIcon sx={{ fontSize: 12, color: idle ? "warning.main" : "success.main" }} />
          <Typography fontWeight={700} color={idle ? "warning.main" : "success.main"}>
            {idle ? "Session active — idle" : "Session active"}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Welcome, {name}. Your login on {computer.name} is recorded for attendance and lab policy.
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary">SESSION DURATION</Typography>
          <Typography variant="h4" fontWeight={700}>{mins}:{secs}</Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          This is a login/attendance record only. Full activity monitoring (application usage, USB activity, resource usage) requires the LabWatch endpoint agent, not yet installed on this machine.
        </Alert>

        <Button fullWidth variant="outlined" color="error" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? <CircularProgress size={20} /> : "Log Off"}
        </Button>
      </Paper>
    </Box>
  );
}

const centerBox = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: "radial-gradient(circle at top, #16213e 0%, #0b1120 60%)",
};
