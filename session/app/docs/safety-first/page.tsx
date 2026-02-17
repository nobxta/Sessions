import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'Safety First — OG Session Manager | HQAdz.io',
  description: 'How to avoid bans: proxies, delays, and best practices for session usage.',
};

export default function SafetyFirstDoc() {
  return (
    <DocPage
      title="Safety First"
      description="Best practices to avoid getting sessions restricted or banned."
    >
      <h2>Why it matters</h2>
      <p>
        Telegram applies rate limits and anti-abuse measures. Accounts that send too many messages too quickly, switch IPs abruptly, or behave like bots can get temporarily limited, hard-limited, or frozen. This guide outlines practical steps to reduce that risk when using OG Session Manager and automation in general.
      </p>

      <h2>Delays between actions</h2>
      <p>
        Space out actions per account. For example:
      </p>
      <ul>
        <li>Add a delay of several seconds (e.g. 3–10+) between sending messages or running bulk operations.</li>
        <li>When leaving many groups or changing many profiles, process in batches with pauses between batches.</li>
        <li>Avoid running multiple heavy tools (e.g. mass messaging + group leaves) on the same account in a short window.</li>
      </ul>
      <p>
        The exact numbers depend on Telegram’s current limits; when in doubt, use longer delays and fewer actions per hour.
      </p>

      <h2>Proxy usage</h2>
      <p>
        Using a <strong>proxy per account</strong> (or per small group of accounts) helps:
      </p>
      <ul>
        <li>Avoid “too many accounts from one IP” flags.</li>
        <li>Keep traffic patterns looking more natural (different IPs for different users).</li>
        <li>Reduce risk when running many sessions from one server.</li>
      </ul>
      <p>
        OG Session Manager’s backend can be configured to use proxies if your deployment supports it (e.g. environment or config per run). Prefer residential or reliable datacenter proxies; avoid free or abusive IPs.
      </p>

      <h2>Session hygiene</h2>
      <ul>
        <li>Validate sessions regularly and remove dead or frozen ones so you don’t waste effort on invalid accounts.</li>
        <li>Don’t share session files or strings; treat them as secrets.</li>
        <li>Use the SpamBot Checker to see which accounts are limited; appeal or retire them instead of hammering Telegram.</li>
      </ul>

      <h2>Respecting limits</h2>
      <p>
        If you hit <strong>FloodWait</strong> or similar errors, back off: wait at least as long as the error suggests (or longer) before retrying. Pushing through rate limits increases the chance of temporary or permanent restrictions. Our tools surface errors like “Session not authorized” or “FloodWait”; use them as signals to slow down or switch account.
      </p>

      <p>
        In short: use delays, consider proxies for multi-account use, keep sessions valid and private, and respect Telegram’s rate limits. That will help you get the most out of OG Session Manager without unnecessary risk.
      </p>
    </DocPage>
  );
}
