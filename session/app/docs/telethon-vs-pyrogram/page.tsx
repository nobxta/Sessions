import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'Telethon vs. Pyrogram — OG Session Manager | HQAdz.io',
  description: 'Technical comparison of the two main MTProto libraries for Telegram.',
};

export default function TelethonVsPyrogramDoc() {
  return (
    <DocPage
      title="Telethon vs. Pyrogram"
      description="A technical comparison of the two main Python MTProto libraries for Telegram."
    >
      <h2>Overview</h2>
      <p>
        <strong>Telethon</strong> and <strong>Pyrogram</strong> are the two most widely used Python libraries for interacting with Telegram’s API via the MTProto protocol. Both allow you to build bots, userbots, and automation tools. OG Session Manager’s backend is built with Telethon; this article summarizes how the two compare so you can choose the right one for your own projects.
      </p>

      <h2>Telethon</h2>
      <ul>
        <li><strong>Maturity:</strong> Long-standing project with a large ecosystem and extensive documentation.</li>
        <li><strong>API style:</strong> Method names and types closely follow Telegram’s API (e.g. <code>client.get_entity()</code>, <code>SendMessageRequest</code>). More “raw” and flexible.</li>
        <li><strong>Sessions:</strong> Native .session file support (SQLite); also supports string sessions. Default session is file-based.</li>
        <li><strong>Use case:</strong> Userbots, automation, full control over raw TL methods, and tools that need to mirror official client behavior (e.g. our Session Manager).</li>
      </ul>

      <h2>Pyrogram</h2>
      <ul>
        <li><strong>Design:</strong> Focus on a clean, high-level API and async-first usage.</li>
        <li><strong>API style:</strong> More Pythonic naming and abstractions (e.g. <code>send_message</code>, <code>get_chat</code>). Often fewer lines of code for common tasks.</li>
        <li><strong>Sessions:</strong> Uses string sessions by default; no built-in .session file format (you can still convert to/from strings via our Session Converter).</li>
        <li><strong>Use case:</strong> Bots and userbots where developer experience and brevity matter; projects that prefer string-only session storage.</li>
      </ul>

      <h2>Session compatibility</h2>
      <p>
        Both libraries use the same underlying MTProto auth. The <strong>auth key and DC information</strong> are interchangeable. Telethon’s string session format is compatible with Pyrogram’s string sessions in practice, so you can often use the same string in both libraries for the same account. Our Session Converter produces strings that work with Telethon; they are typically usable with Pyrogram as well for login purposes.
      </p>

      <h2>When to use which</h2>
      <p>
        Choose <strong>Telethon</strong> if you need file-based sessions, maximum control over TL methods, or are integrating with tools (like OG Session Manager) that expect Telethon. Choose <strong>Pyrogram</strong> if you prefer a higher-level API and string-only sessions and don’t need .session file support. For session management and the tools we provide, the backend uses Telethon; your own scripts can use either library and still consume sessions converted to the format you need.
      </p>
    </DocPage>
  );
}
