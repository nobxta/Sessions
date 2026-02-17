import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'What is a Telegram Session? — OG Session Manager | HQAdz.io',
  description: 'Understand .session files vs. string sessions and how Telegram auth works.',
};

export default function WhatIsTelegramSessionDoc() {
  return (
    <DocPage
      title="What is a Telegram Session?"
      description="Understanding .session files, string sessions, and how Telegram authentication is stored."
    >
      <h2>Overview</h2>
      <p>
        A <strong>Telegram session</strong> is a stored representation of an authenticated connection to Telegram. Instead of logging in with a phone number and code every time, your client (e.g. Telethon or Pyrogram) saves an <strong>auth key</strong> and related data. Future runs reuse this key so the account stays “logged in” without user interaction.
      </p>

      <h2>.session files</h2>
      <p>
        In <strong>Telethon</strong>, the default format is a <strong>.session file</strong>. This is typically a SQLite database (or a single file containing the same data) stored on disk. It holds:
      </p>
      <ul>
        <li>The <strong>auth key</strong> (secret, long-term key agreed with Telegram)</li>
        <li><strong>DC (data center) ID</strong> and connection info</li>
        <li>Optional cached user/entity data</li>
      </ul>
      <p>
        .session files are easy to backup, copy, and use across machines. Many desktop tools and our Session Manager use this format for upload and processing.
      </p>

      <h2>String sessions</h2>
      <p>
        A <strong>string session</strong> is the same session data encoded into a single text string (often base64). It contains the same auth key and DC information. Libraries like <strong>Telethon</strong> and <strong>Pyrogram</strong> both support creating a client from a string:
      </p>
      <ul>
        <li>Easy to store in environment variables, config files, or databases</li>
        <li>No need to manage files on disk</li>
        <li>Portable across servers and serverless environments</li>
      </ul>
      <p>
        Our <strong>Session Converter</strong> tool converts between .session files and string sessions so you can use the same account in either form.
      </p>

      <h2>Security and safety</h2>
      <p>
        Whoever has the session (file or string) can act as that Telegram account. Treat sessions like passwords: don’t share them, store them securely, and avoid committing them to version control. Use the <strong>Safety First</strong> guide for best practices on avoiding bans and handling sessions at scale.
      </p>
    </DocPage>
  );
}
