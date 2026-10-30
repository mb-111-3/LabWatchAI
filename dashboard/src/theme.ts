import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#5b8def" },
    secondary: { main: "#2dd4bf" },
    background: { default: "#0b1120", paper: "#111a2e" },
    success: { main: "#22c55e" },
    warning: { main: "#f59e0b" },
    error: { main: "#ef4444" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: `"Inter", "Segoe UI", Roboto, sans-serif`,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
  },
});
