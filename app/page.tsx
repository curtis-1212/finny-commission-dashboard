export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>FINNY Commission Bot</h1>
      <p>Daily commission summary → Slack at 6 PM ET.</p>
      <p style={{ color: "#666" }}>
        Cron endpoint: <code>/api/cron/daily-commission</code>
      </p>
    </main>
  );
}
