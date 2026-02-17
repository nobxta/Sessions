'use client';

import Link from 'next/link';
import { HelpCircle } from 'lucide-react';

interface PageHelpLinkProps {
  href: string;
  label?: string;
}

export default function PageHelpLink({ href, label = 'How to use' }: PageHelpLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-blue-400 transition-colors"
      title={label}
    >
      <HelpCircle className="w-4 h-4 flex-shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
