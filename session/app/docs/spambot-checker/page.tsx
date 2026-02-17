import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'Telegram Spam Checker — OG Session Manager | HQAdz.io',
  description: 'Learn how to check temporary vs. hard limits via @SpamBot with OG Session Manager.',
};

export default function SpamBotCheckerDoc() {
  return (
    <DocPage
      title="Telegram Spam Checker"
      description="Check account health and spam limits via Telegram’s official @SpamBot."
    >
      <h2>What it is</h2>
      <p>
        The <strong>SpamBot Checker</strong> uses Telegram’s official @SpamBot to determine whether each of your accounts has any anti-spam restrictions. It distinguishes between temporary limits (time-bound) and hard limits (permanent until appeal), plus frozen and fully active accounts—so you can prioritize which accounts to use or appeal.
      </p>

      <h2>Status types</h2>
      <ul>
        <li><strong>Active</strong> — No limits; account can message normally.</li>
        <li><strong>Temp limited</strong> — Temporary restriction until a given date; often auto-lifts.</li>
        <li><strong>Hard limited</strong> — Stronger, long-term limit; may require an appeal to @SpamBot.</li>
        <li><strong>Frozen</strong> — Account blocked for Terms of Service violations.</li>
        <li><strong>Failed / Unauthorized</strong> — Session invalid, expired, or unable to reach @SpamBot.</li>
      </ul>

      <h2>How to use it</h2>
      <ol>
        <li>Open <strong>SpamBot Checker</strong> from the dashboard or sidebar.</li>
        <li>Upload a <code>.session</code> file or a ZIP of multiple session files.</li>
        <li>Wait for extraction to finish; the list of sessions will appear.</li>
        <li>Click <strong>Check SpamBot</strong> to run the check for all extracted sessions.</li>
        <li>Review the results: each session shows one of the statuses above.</li>
        <li>Use <strong>SpamBot Appeal</strong> (separate tool) for hard-limited or frozen accounts if you want to submit an appeal.</li>
      </ol>

      <p>
        The tool connects each session to Telegram, opens a chat with @SpamBot, sends <code>/start</code>, and parses the bot’s reply to determine the status. No manual steps are required once you start the check.
      </p>
    </DocPage>
  );
}
