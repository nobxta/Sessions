import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'Session Converter — OG Session Manager | HQAdz.io',
  description: 'Convert between .session files and Telethon/Pyrogram string sessions.',
};

export default function SessionConverterDoc() {
  return (
    <DocPage
      title="Session Converter"
      description="Convert between .session files and Telethon/Pyrogram string sessions."
    >
      <h2>What it is</h2>
      <p>
        The <strong>Session Converter</strong> converts Telegram session data between two common formats: <strong>file-based sessions</strong> (e.g. <code>.session</code> SQLite files used by Telethon) and <strong>string sessions</strong> (base64-encoded strings used by Telethon and Pyrogram). This lets you use the same account in different environments—for example, exporting from a desktop tool that uses files into a script or server that expects a string.
      </p>

      <h2>.session files vs. string sessions</h2>
      <ul>
        <li><strong>.session files</strong> — Stored on disk (often SQLite). Used by Telethon’s default session type and by many GUI tools. Easy to backup as files.</li>
        <li><strong>String sessions</strong> — Single-line encoded strings containing the same auth key and DC info. Easy to store in configs, env vars, or databases. Supported by both Telethon and Pyrogram.</li>
      </ul>

      <h2>Conversion directions</h2>
      <ul>
        <li><strong>Sessions → Strings</strong> — Upload one or more <code>.session</code> files (or a ZIP). The tool outputs the corresponding string session(s). You can copy or store these for use in code (e.g. <code>TelegramClient(StringSession(string), api_id, api_hash)</code>).</li>
        <li><strong>Strings → Sessions</strong> — Paste one or more string sessions. The tool generates <code>.session</code> files and typically offers them as a ZIP download. Useful when you have strings from another source and need files for a file-based workflow.</li>
      </ul>

      <h2>How to use it</h2>
      <ol>
        <li>Open <strong>Session Converter</strong> from the dashboard or sidebar.</li>
        <li><strong>To get strings:</strong> Upload <code>.session</code> file(s) or a ZIP, then run “Sessions to strings”. Copy or download the resulting strings.</li>
        <li><strong>To get files:</strong> Paste string session(s) into the input area, then run “Strings to sessions”. Download the generated ZIP and extract the <code>.session</code> files where needed.</li>
      </ol>

      <p>
        Conversion is local to the backend: session data is decoded/encoded without re-authenticating with Telegram. The same account can be used in both formats interchangeably.
      </p>
    </DocPage>
  );
}
