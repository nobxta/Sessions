'use client';

import PageLayout from './PageLayout';

export default function PageLayoutWrapper({ children }: { children: React.ReactNode }) {
  return <PageLayout>{children}</PageLayout>;
}

