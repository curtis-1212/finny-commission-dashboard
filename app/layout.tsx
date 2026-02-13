export const metadata = { title: "FINNY Commission Dashboard" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0B1120" }}>{children}</body>
    </html>
  );
}
