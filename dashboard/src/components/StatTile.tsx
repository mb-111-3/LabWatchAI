import { Paper, Stack, Typography, Box } from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";

export default function StatTile({
  label, value, icon: Icon, color,
}: { label: string; value: string | number; icon: SvgIconComponent; color: string }) {
  return (
    <Paper sx={{ p: 2.5, flex: 1, minWidth: 160 }} elevation={4}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box sx={{
          width: 44, height: 44, borderRadius: 2, display: "flex", alignItems: "center",
          justifyContent: "center", bgcolor: `${color}22`, color,
        }}>
          <Icon />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>{value}</Typography>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
