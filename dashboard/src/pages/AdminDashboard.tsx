import { useEffect, useMemo, useState } from "react";
import {
  Box, Grid, Tabs, Tab, Typography, Paper, Table, TableHead, TableRow,
  TableCell, TableBody, Chip, Stack, TextField, Button, AppBar, Toolbar,
  Container, Divider,
} from "@mui/material";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import PeopleIcon from "@mui/icons-material/People";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import UsbIcon from "@mui/icons-material/Usb";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ReactECharts from "echarts-for-react";
import { api, connectWS } from "../api/client";
import type { Alert as AlertT, Computer, SessionRec, Summary, USBEvent } from "../types";
import StatTile from "../components/StatTile";
import ComputerCard from "../components/ComputerCard";

const severityColor: Record<string, "default" | "warning" | "error" | "info"> = {
  low: "info", medium: "warning", high: "error",
};

// backend order is unstable (map iteration) — always render in a fixed, stable order
function sortComputers(list: Computer[]): Computer[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export default function AdminDashboard() {
  const [tab, setTab] = useState(0);
  const [computers, setComputers] = useState<Computer[]>([]);
  const [sessions, setSessions] = useState<SessionRec[]>([]);
  const [alerts, setAlerts] = useState<AlertT[]>([]);
  const [usbEvents, setUsbEvents] = useState<USBEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<{ hour: string; usage: number }[]>([]);
  const [query, setQuery] = useState("");
  const [assistantLog, setAssistantLog] = useState<{ q: string; a: string }[]>([]);

  function refreshAll() {
    api.get("/computers").then((r) => setComputers(sortComputers(r.data)));
    api.get("/sessions").then((r) => setSessions(r.data));
    api.get("/alerts").then((r) => setAlerts(r.data));
    api.get("/usb-events").then((r) => setUsbEvents(r.data));
    api.get("/stats/summary").then((r) => setSummary(r.data));
    api.get("/stats/usage-trend").then((r) => setTrend(r.data));
  }

  useEffect(() => {
    refreshAll();
    const disconnect = connectWS((type, data) => {
      if (type === "computers_update") setComputers(sortComputers(data));
      if (type === "alert") setAlerts((prev) => [data, ...prev].slice(0, 100));
      if (type === "usb_event") setUsbEvents((prev) => [data, ...prev].slice(0, 100));
      if (type === "session_created") setSessions((prev) => [data, ...prev]);
    });
    const poll = setInterval(() => {
      api.get("/stats/summary").then((r) => setSummary(r.data));
      // safety-net poll in case a WS push is ever missed/dropped
      api.get("/computers").then((r) => setComputers(sortComputers(r.data)));
    }, 5000);
    return () => { disconnect(); clearInterval(poll); };
  }, []);

  const labGroups = useMemo(() => {
    const groups: Record<string, Computer[]> = {};
    for (const c of computers) (groups[c.lab] ??= []).push(c);
    return groups;
  }, [computers]);

  const loginTrendOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category", data: trend.map((t) => t.hour), axisLine: { lineStyle: { color: "#334155" } } },
    yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#1e293b" } } },
    series: [{
      data: trend.map((t) => t.usage), type: "line", smooth: true, areaStyle: { opacity: 0.15 },
      itemStyle: { color: "#5b8def" }, lineStyle: { width: 3 },
    }],
  };

  const statusPieOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { color: "#cbd5e1" } },
    series: [{
      type: "pie", radius: ["45%", "70%"],
      data: [
        { value: summary?.inUse ?? 0, name: "In Use", itemStyle: { color: "#5b8def" } },
        { value: summary?.available ?? 0, name: "Available", itemStyle: { color: "#475569" } },
      ],
      label: { color: "#cbd5e1" },
    }],
  };

  async function askAssistant() {
    if (!query.trim()) return;
    const q = query;
    setQuery("");
    const r = await api.post("/assistant/query", { query: q });
    setAssistantLog((prev) => [...prev, { q, a: r.data.answer }]);
  }

  function computerName(id: string) {
    return computers.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: "1px solid #1e2a45" }}>
        <Toolbar>
          <DesktopWindowsIcon color="primary" sx={{ mr: 1.5 }} />
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>LabWatch AI — Admin Dashboard</Typography>
          <Chip size="small" color="primary" label={`${summary?.inUse ?? 0} in use`} sx={{ mr: 1 }} />
          <Chip size="small" label={`${summary?.available ?? 0} available`} variant="outlined" />
        </Toolbar>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
          <Tab label="Overview" />
          <Tab label="Computers" />
          <Tab label="Attendance" />
          <Tab label="Alerts" />
          <Tab label="USB Activity" />
          <Tab label="AI Assistant" />
        </Tabs>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {tab === 0 && (
          <Stack spacing={3}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
              <StatTile label="Total Computers" value={summary?.totalComputers ?? 0} icon={DesktopWindowsIcon} color="#5b8def" />
              <StatTile label="Available PCs" value={summary?.available ?? 0} icon={CheckCircleIcon} color="#22c55e" />
              <StatTile label="Active Sessions" value={summary?.activeSessions ?? 0} icon={PeopleIcon} color="#2dd4bf" />
              <StatTile label="Alerts" value={summary?.totalAlerts ?? 0} icon={WarningAmberIcon} color="#f59e0b" />
              <StatTile label="USB Events" value={summary?.usbEventsToday ?? 0} icon={UsbIcon} color="#a78bfa" />
            </Stack>
            <Grid container spacing={2}>
              <Grid item xs={12} md={7}>
                <Paper sx={{ p: 2 }} elevation={4}>
                  <Typography fontWeight={600} sx={{ mb: 1 }}>Logins in the Last 8 Hours</Typography>
                  <ReactECharts option={loginTrendOption} style={{ height: 260 }} />
                </Paper>
              </Grid>
              <Grid item xs={12} md={5}>
                <Paper sx={{ p: 2 }} elevation={4}>
                  <Typography fontWeight={600} sx={{ mb: 1 }}>Computer Status</Typography>
                  <ReactECharts option={statusPieOption} style={{ height: 260 }} />
                </Paper>
              </Grid>
            </Grid>
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={4}>
            {Object.entries(labGroups).map(([lab, list]) => (
              <Box key={lab}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>{lab}</Typography>
                <Grid container spacing={2}>
                  {list.map((c) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={c.id}>
                      <ComputerCard c={c} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}
          </Stack>
        )}

        {tab === 2 && (
          <Paper elevation={4}>
            {sessions.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary">No logins recorded yet.</Typography>
              </Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Roll No.</TableCell>
                    <TableCell>Class / Batch</TableCell>
                    <TableCell>Computer</TableCell>
                    <TableCell>Login Time</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.rollNumber || "—"}</TableCell>
                      <TableCell>{s.class ? `${s.class} / ${s.batch}` : "—"}</TableCell>
                      <TableCell>{computerName(s.computerId)}</TableCell>
                      <TableCell>{new Date(s.loginTime).toLocaleTimeString()}</TableCell>
                      <TableCell>
                        <Chip size="small" label={s.logoutTime ? "Ended" : "Active"} color={s.logoutTime ? "default" : "success"} />
                      </TableCell>
                      <TableCell><Chip size="small" label={s.isGuest ? "Guest" : "Student"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        )}

        {tab === 3 && (
          <Paper elevation={4}>
            {alerts.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary">No alerts.</Typography>
              </Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Severity</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Computer</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alerts.map((a) => (
                    <TableRow key={a.id} hover>
                      <TableCell><Chip size="small" color={severityColor[a.severity]} label={a.severity} /></TableCell>
                      <TableCell>{a.type}</TableCell>
                      <TableCell>{computerName(a.computerId)}</TableCell>
                      <TableCell>{a.message}</TableCell>
                      <TableCell>{new Date(a.timestamp).toLocaleTimeString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        )}

        {tab === 4 && (
          <Paper elevation={4}>
            {usbEvents.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary">
                  No USB activity recorded. USB monitoring requires the endpoint agent, which is not yet installed on these PCs.
                </Typography>
              </Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Device</TableCell>
                    <TableCell>Vendor ID</TableCell>
                    <TableCell>Serial No.</TableCell>
                    <TableCell>Computer</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usbEvents.map((u) => (
                    <TableRow key={u.id} hover>
                      <TableCell>{u.deviceName}</TableCell>
                      <TableCell>{u.vendorId}</TableCell>
                      <TableCell>{u.serialNo}</TableCell>
                      <TableCell>{computerName(u.computerId)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={u.action} color={u.action === "blocked" ? "error" : "default"} />
                      </TableCell>
                      <TableCell>{new Date(u.timestamp).toLocaleTimeString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        )}

        {tab === 5 && (
          <Paper sx={{ p: 3, maxWidth: 720 }} elevation={4}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <SmartToyIcon color="secondary" />
              <Typography fontWeight={700}>LabWatch AI Assistant</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Ask natural-language questions e.g. "Which computers are available?", "How many USB events today?", "Any alerts?"
            </Typography>
            <Stack spacing={1.5} sx={{ mb: 2, maxHeight: 320, overflowY: "auto" }}>
              {assistantLog.map((entry, i) => (
                <Box key={i}>
                  <Typography variant="body2" fontWeight={600}>You: {entry.q}</Typography>
                  <Typography variant="body2" color="secondary.main">AI: {entry.a}</Typography>
                  <Divider sx={{ mt: 1 }} />
                </Box>
              ))}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth size="small" placeholder="Ask a question..." value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askAssistant()}
              />
              <Button variant="contained" onClick={askAssistant}>Ask</Button>
            </Stack>
          </Paper>
        )}
      </Container>
    </Box>
  );
}
