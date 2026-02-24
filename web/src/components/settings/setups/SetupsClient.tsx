'use client';

import { Suspense } from 'react';
import { SetupsInner } from './SetupsInner';

export function SetupsClient() {
  return (
    <Suspense fallback={<main className='p-6'>Loading...</main>}>
      <SetupsInner />
    </Suspense>
  );
}