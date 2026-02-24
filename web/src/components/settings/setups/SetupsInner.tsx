'use client';

import { useSearchParams } from 'next/navigation';
import { useSetups } from '@/src/hooks/useSetups';
import { SetupsHeader } from './SetupsHeader';
import { SetupsCreateTemplate } from './SetupsCreateTemplate';
import { SetupsTemplatesPanel } from './SetupsTemplatesPanel';
import { SetupsItemsPanel } from './SetupsItemsPanel';
import { SetupsDeleteModal } from './SetupsDeleteModal';

export function SetupsInner() {
  const s = useSetups();
  const sp = useSearchParams();

  // Only allow internal paths to avoid open-redirect issues.
  const returnToParam = sp.get('returnTo');
  const returnTo =
    returnToParam && returnToParam.startsWith('/') ? returnToParam : null;

  function handleBack() {
    if (returnTo) {
      s.router.push(returnTo);
      return;
    }
    s.router.back();
  }

  if (s.loading) return <main className='p-6'>Loading...</main>;

  return (
    <main className='p-6 space-y-6'>
      <SetupsDeleteModal state={s} />

      <SetupsHeader state={s} onBack={handleBack} />

      <SetupsCreateTemplate state={s} />

      <SetupsTemplatesPanel state={s} />

      {s.selectedTemplateId && <SetupsItemsPanel state={s} />}
    </main>
  );
}