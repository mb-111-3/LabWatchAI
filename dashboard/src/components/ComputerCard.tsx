import { Paper, Stack, Typography, Box, Chip, IconButton, Menu, MenuItem } from "@mui/material";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useState } from "react";
import type { Computer } from "../types";
import { api } from "../api/client";

export default function ComputerCard({ c }: { c: Computer }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  async function sendCommand(action: string) {
    setAnchor(null);
    await api.post(`/computers/${c.id}/command`, { action });
  }

  const inUse = c.status === "in-use";

  return (
    <Paper sx={{ p: 2, border: "1px solid #1e2a45" }} elevation={4}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Stack direction="row" spacing={1.2} alignItems="center">
          <DesktopWindowsIcon color={inUse ? "primary" : "disabled"} />
          <Box>
            <Typography fontWeight={600}>{c.name}</Typography>
            <Typography variant="caption" color="text.secondary">{c.lab} · {c.os}</Typography>
          </Box>
        </Stack>
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} disabled={!inUse}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
          <MenuItem onClick={() => sendCommand("logoff")}>End Session</MenuItem>
        </Menu>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center" flexWrap="wrap">
        <Chip
          size="small" label={inUse ? "IN USE" : "AVAILABLE"}
          color={inUse ? "primary" : "default"} variant={inUse ? "filled" : "outlined"}
        />
        {c.currentUser && <Chip size="small" label={c.currentUser} variant="outlined" />}
        {inUse && c.isIdle && <Chip size="small" label="Idle" color="warning" variant="outlined" />}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
        {c.ip}
      </Typography>
    </Paper>
  );
}
