import DocPage from '@/components/docs/DocPage';

export const metadata = {
  title: 'Name & Bio Changer — OG Session Manager | HQAdz.io',
  description: 'Bulk edit display names, usernames, bios, and profile pictures.',
};

export default function NameBioChangerDoc() {
  return (
    <DocPage
      title="Name & Bio Changer"
      description="Bulk-edit display names, usernames, bios, and profile pictures across many sessions."
    >
      <h2>What it is</h2>
      <p>
        The Session Manager includes several <strong>profile tools</strong> that let you change Telegram account profile data in bulk: <strong>Change Name</strong> (first/last display name), <strong>Change Username</strong>, <strong>Change Bio</strong>, and <strong>Change Profile Picture</strong>. You upload sessions once, set the new values per account (or a common value for all), and run the update. Each tool processes multiple sessions in parallel where possible.
      </p>

      <h2>Tools included</h2>
      <ul>
        <li><strong>Change Name</strong> — Set display first name (and optionally last name) for each session.</li>
        <li><strong>Change Username</strong> — Set the @username for each account (must be unique and available).</li>
        <li><strong>Change Bio</strong> — Set the “About” / bio text for each account.</li>
        <li><strong>Change Profile Picture</strong> — Upload an image and set it as the profile photo for selected sessions.</li>
      </ul>

      <h2>Bulk editing</h2>
      <p>
        For each tool you upload a single session file or a ZIP of sessions. The UI lists all extracted sessions and lets you enter the new name, username, bio, or select an image per row (or apply one value to many). When you run the action, the backend updates each account via Telegram’s API. Results are shown per session (success or error message).
      </p>

      <h2>How to use (general steps)</h2>
      <ol>
        <li>Open the relevant tool (<strong>Change Name</strong>, <strong>Change Username</strong>, <strong>Change Bio</strong>, or <strong>Change Picture</strong>) from the dashboard or sidebar.</li>
        <li>Upload a <code>.session</code> file or a ZIP of session files.</li>
        <li>Fill in the new value(s) for each session (or for all).</li>
        <li>Click the action button (e.g. <strong>Update names</strong>, <strong>Update usernames</strong>) to apply changes.</li>
        <li>Check the results; fix any errors (e.g. username taken) and retry if needed.</li>
      </ol>

      <p>
        Use these tools when you need to standardize or rotate profile data across many accounts, or when preparing accounts for specific campaigns.
      </p>
    </DocPage>
  );
}
