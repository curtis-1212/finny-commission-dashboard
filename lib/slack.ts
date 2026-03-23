// SERVER-ONLY -- Shared Slack notification helper.

export async function sendSlackBlocks(blocks: any[]): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
  return res.ok;
}
