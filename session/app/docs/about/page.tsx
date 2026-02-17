import DocPage from '@/components/docs/DocPage';
import Link from 'next/link';
import { ExternalLink, Heart } from 'lucide-react';

export const metadata = {
  title: 'About HQAdz — OG Session Manager | HQAdz.io',
  description: 'OG Session Manager is a free tool by HQAdz.io for the Telegram developer community.',
};

export default function AboutPage() {
  return (
    <DocPage
      title="About HQAdz"
      description="Credits and the story behind OG Session Manager."
    >
      <div className="doc-card">
        <p className="text-gray-300 leading-relaxed mb-0">
          <strong className="text-white">OG Session Manager</strong> is a free tool provided by <strong className="text-white">HQAdz.io</strong> for the Telegram developer community.
        </p>
      </div>

      <h2>Our mission</h2>
      <p>
        We built OG Session Manager to give developers and power users a single, reliable place to validate sessions, check account health, manage profiles in bulk, convert between session formats, and handle common tasks like listening for login codes or leaving groups. We keep the toolkit free so that anyone working with Telegram automation or multi-account workflows can use it without friction.
      </p>

      <h2>What we offer</h2>
      <p>
        The suite includes session validation, SpamBot checking and appeals, code extraction, name/bio/username/picture tools, session conversion, TGDNA age checking, group and folder management, and more. Documentation and guides are available in the <Link href="/docs">Master Guide</Link> so you can get the most out of each feature.
      </p>

      <h2>Credits</h2>
      <p>
        OG Session Manager is created and maintained by <strong>HQAdz.io</strong>. It uses open-source libraries and Telegram’s official API. We thank the Telegram developer community and the contributors behind projects like Telethon for making this kind of tool possible.
      </p>

      <p className="flex items-center gap-2 text-gray-400">
        <Heart className="w-4 h-4 text-red-400/80 flex-shrink-0" />
        <span>Built for the community, with care.</span>
      </p>

      <hr />

      <p className="text-sm text-gray-500">
        For more about HQAdz.io, visit{' '}
        <a
          href="https://hqadz.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
        >
          hqadz.io
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        .
      </p>
    </DocPage>
  );
}
