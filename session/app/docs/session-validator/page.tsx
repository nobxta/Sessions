import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'Session Validator — OG Session Manager | HQAdz.io',
  description: 'Validate Telegram sessions: ZIP upload, status results (Active, Frozen, Dead).',
};

export default function SessionValidatorDoc() {
  return (
    <DocPage
      title="Session Validator"
      description="Validate Telegram session files in bulk and see Active, Frozen, or Dead status."
    >
      <h2>What it is</h2>
      <p>
        The <strong>Session Validator</strong> checks whether your Telegram session files are still usable. It connects each session to Telegram’s servers and reports whether the account is <strong>Active</strong>, <strong>Frozen</strong>, or <strong>Unauthorized (dead)</strong>. You can upload a single <code>.session</code> file or a ZIP containing many sessions and validate them all in one run.
      </p>

      <h2>Upload process</h2>
      <ul>
        <li><strong>Single file:</strong> Upload one <code>.session</code> file. It will be extracted and validated.</li>
        <li><strong>ZIP archive:</strong> Upload a ZIP that contains one or more <code>.session</code> files (any folder structure). The tool discovers all sessions inside and validates each one.</li>
      </ul>
      <p>
        After upload, sessions are listed with names (usually derived from the filename). You then start validation; progress is shown in real time over a WebSocket connection.
      </p>

      <h2>Status results</h2>
      <ul>
        <li><strong>Active</strong> — Session is authorized and can be used normally.</li>
        <li><strong>Frozen</strong> — Account has been blocked by Telegram (e.g. for ToS violations).</li>
        <li><strong>Unauthorized / Dead</strong> — Session is invalid, expired, or logged out; it cannot be used until the account is logged in again (e.g. via Session Maker).</li>
      </ul>

      <h2>How to use it</h2>
      <ol>
        <li>Open <strong>Validate Sessions</strong> from the dashboard or sidebar.</li>
        <li>Upload a <code>.session</code> file or a ZIP of session files.</li>
        <li>Wait for the session list to appear.</li>
        <li>Click <strong>Start validation</strong> (or equivalent) to run the check.</li>
        <li>Review the results and, if needed, download filtered sessions (e.g. only Active) as a new ZIP using the download option on the page.</li>
      </ol>

      <p>
        Use this tool regularly to clean your session library: remove dead or frozen sessions and keep only active ones for your workflows.
      </p>
    </DocPage>
  );
}
