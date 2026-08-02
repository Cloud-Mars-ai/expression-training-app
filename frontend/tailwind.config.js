/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        "surface-muted": "var(--color-surface-muted)",
        ink: "var(--color-ink)",
        "ink-soft": "var(--color-ink-soft)",
        "ink-muted": "var(--color-ink-muted)",
        line: "var(--color-line)",
        primary: "var(--color-primary)",
        "primary-strong": "var(--color-primary-strong)",
        "primary-soft": "var(--color-primary-soft)",
        success: "var(--color-success)",
        "success-soft": "var(--color-success-soft)",
        warning: "var(--color-warning)",
        "warning-soft": "var(--color-warning-soft)",
        danger: "var(--color-danger)",
        "danger-soft": "var(--color-danger-soft)",
        violet: "var(--color-violet)",
        "violet-soft": "var(--color-violet-soft)",
        record: "var(--color-record)",
        "record-soft": "var(--color-record-soft)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      spacing: {
        gutter: "var(--page-gutter)",
        "safe-bottom": "var(--safe-bottom)",
      },
    },
  },
  plugins: [],
};
