'use client';

import Link from 'next/link';
import {
  BookOpen,
  Shield,
  ShieldCheck,
  Key,
  User,
  Code,
  Calendar,
  FileQuestion,
  Cpu,
  Lock,
} from 'lucide-react';

const categories = [
  {
    title: 'Tool guides',
    description: 'Step-by-step guides for each tool in the Session Manager.',
    links: [
      { href: '/docs/spambot-checker', title: 'Telegram Spam Checker', icon: Shield },
      { href: '/docs/session-validator', title: 'Session Validator', icon: ShieldCheck },
      { href: '/docs/code-extractor', title: 'Code Extractor', icon: Key },
      { href: '/docs/name-bio-changer', title: 'Name & Bio Changer', icon: User },
      { href: '/docs/session-converter', title: 'Session Converter', icon: Code },
      { href: '/docs/tgdna-group-manager', title: 'TGDNA & Group Manager', icon: Calendar },
    ],
  },
  {
    title: 'Knowledge base',
    description: 'Deep-dive articles on sessions, libraries, and best practices.',
    links: [
      { href: '/docs/what-is-telegram-session', title: 'What is a Telegram Session?', icon: FileQuestion },
      { href: '/docs/telethon-vs-pyrogram', title: 'Telethon vs. Pyrogram', icon: Cpu },
      { href: '/docs/safety-first', title: 'Safety First', icon: Lock },
    ],
  },
];

export default function DocsIndexPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <header className="mb-12">
          <div className="flex items-center gap-2 text-blue-400/80 mb-2">
            <BookOpen className="w-5 h-5" />
            <span className="text-xs font-medium uppercase tracking-wider">Documentation & guide</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Master guide</h1>
          <p className="text-gray-400 text-lg max-w-2xl">
            Everything you need to use OG Session Manager: tool guides, knowledge base articles, and best practices for the Telegram developer community.
          </p>
        </header>

        <div className="space-y-12">
          {categories.map((cat) => (
            <section key={cat.title}>
              <h2 className="text-xl font-semibold text-white mb-2">{cat.title}</h2>
              <p className="text-gray-400 text-sm mb-6">{cat.description}</p>
              <ul className="space-y-2">
                {cat.links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all group"
                      >
                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/20 transition-colors">
                          <Icon className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="font-medium text-white group-hover:text-blue-400/90 transition-colors">
                          {link.title}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="mt-16 pt-8 border-t border-white/10">
          <p className="text-gray-500 text-sm">
            OG Session Manager is a free tool by{' '}
            <a
              href="/docs/about"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              HQAdz.io
            </a>
            . Questions? Check the knowledge base or tool-specific guides above.
          </p>
        </footer>
      </div>
    </div>
  );
}
