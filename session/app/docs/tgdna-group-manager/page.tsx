import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'TGDNA & Group Manager — OG Session Manager | HQAdz.io',
  description: 'Account age checking and bulk leave groups, join folders.',
};

export default function TGDNAGroupManagerDoc() {
  return (
    <DocPage
      title="TGDNA & Group Manager"
      description="Account age checking via @TGDNAbot and bulk group/folder management."
    >
      <h2>What it is</h2>
      <p>
        This section covers two kinds of utilities: <strong>account age and metadata</strong> (via @TGDNAbot) and <strong>group and folder management</strong>. Use them to check how old an account is, whether it has premium or labels, and to leave groups or join/leave chat list (folder) invites in bulk.
      </p>

      <h2>TGDNA / Age Checker</h2>
      <p>
        The <strong>Age Checker</strong> (TGDNA) uses the @TGDNAbot service. For each session you upload, it connects, sends the user ID to the bot, and parses the response to get:
      </p>
      <ul>
        <li>Account creation date (e.g. year-month)</li>
        <li>Account age (e.g. “1 year”, “2 years”)</li>
        <li>Premium status</li>
        <li>Scam / fake labels if any</li>
      </ul>
      <p>
        This helps you filter or label accounts by age or type when building lists or running campaigns.
      </p>

      <h2>Leave All Groups</h2>
      <p>
        <strong>Leave All Groups</strong> lets you scan all groups and supergroups for each uploaded session, then leave selected groups (or all) in bulk. You upload sessions, run the group scan, select which groups to leave per account, and execute. The tool leaves each selected group one by one with optional delays to reduce flood risk.
      </p>

      <h2>Join Folders (Chat Lists)</h2>
      <p>
        <strong>Join Folders</strong> (chat list manager) lets you join Telegram chat list invite links with multiple accounts. You can also leave specific folders per account. You provide session files, optionally configure which folders to leave, and add 1–5 folder invite links to join. The tool processes each account and reports success or failure per step.
      </p>

      <h2>How to use (summary)</h2>
      <ol>
        <li><strong>Age Checker:</strong> Open the tool, upload session(s), run the check, and review the TGDNA results (creation date, age, premium, labels).</li>
        <li><strong>Leave Groups:</strong> Upload sessions → scan groups → select groups to leave → run leave. Use delays and avoid leaving too many in a short time.</li>
        <li><strong>Join Folders:</strong> Upload sessions, add folder invite links (and optional leave config), then run. Check progress and results on the page.</li>
      </ol>

      <p>
        For all bulk actions, follow the <strong>Safety First</strong> guide: use reasonable delays, avoid aggressive automation, and consider proxy usage for high-volume accounts.
      </p>
    </DocPage>
  );
}
