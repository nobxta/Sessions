import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'Code Extractor — OG Session Manager | HQAdz.io',
  description: 'Real-time listening for Telegram login and auth OTP codes.',
};

export default function CodeExtractorDoc() {
  return (
    <DocPage
      title="Code Extractor"
      description="Listen for incoming Telegram login and authentication codes in real time."
    >
      <h2>What it is</h2>
      <p>
        The <strong>Code Extractor</strong> connects one Telegram session at a time and listens for incoming messages that contain <strong>login codes</strong> (numeric OTP for signing in) or <strong>auth codes</strong> (e.g. for Telegram Web or other linked devices). When Telegram sends a code to that account (e.g. “Your login code is 12345”), the tool captures it and displays it in the dashboard so you can use it without opening the Telegram app.
      </p>

      <h2>How it works</h2>
      <p>
        The tool uses a single active listener per session. You select one account (one session) to monitor. The backend keeps that session connected and watches for messages from Telegram’s official service accounts that contain login or auth codes. When a code is detected, it is shown on the Code Extractor page with type (Login Code vs. Web Auth Code) and timestamp.
      </p>

      <h2>How to use it</h2>
      <ol>
        <li>Open <strong>Code Extractor</strong> from the dashboard or sidebar.</li>
        <li>Upload a <code>.session</code> file or ZIP so the session(s) appear in the list.</li>
        <li>Click the <strong>session tile</strong> for the account you want to monitor. Listening starts for that session only.</li>
        <li>Trigger a login or “link device” flow elsewhere (e.g. Telegram desktop or another tool) so Telegram sends a code to that account.</li>
        <li>When the code arrives, it appears on the page. Use <strong>Copy</strong> to paste it where needed.</li>
        <li>To stop listening, click <strong>Stop Scanning</strong> or switch to another session (the previous listener is disconnected automatically). Closing the page also disconnects the listener.</li>
      </ol>

      <p>
        Only one session is listened to at a time. Switching to another number stops the previous listener and starts listening for the newly selected session. This keeps behavior predictable and avoids multiple connections for the same user.
      </p>
    </DocPage>
  );
}
