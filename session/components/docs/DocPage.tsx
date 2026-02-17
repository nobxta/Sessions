'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';

interface DocPageProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

export default function DocPage({
  title,
  description,
  children,
  backHref = '/docs',
  backLabel = 'Back to Guide',
}: DocPageProps) {
  const router = useRouter();

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

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{backLabel}</span>
        </Link>

        <header className="mb-10">
          <div className="flex items-center gap-2 text-blue-400/80 mb-2">
            <BookOpen className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Documentation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{title}</h1>
          {description && (
            <p className="text-gray-400 text-lg leading-relaxed">{description}</p>
          )}
        </header>

        <article className="doc-prose">{children}</article>
      </div>
    </div>
  );
}
