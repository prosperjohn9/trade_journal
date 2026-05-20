'use client';

import { useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';

// Mirrors the request_type CHECK constraint on the contact_messages table in
// migration 20260520000000_create_contact_messages.sql. Adding a new value
// requires updating both this list and the SQL CHECK.
const REQUEST_TYPES = [
  { value: 'general', label: 'General inquiry' },
  { value: 'privacy', label: 'Privacy request (access, export, deletion)' },
  { value: 'billing', label: 'Billing & subscription' },
  { value: 'account', label: 'Account help' },
  { value: 'other', label: 'Other' },
];

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20';

const labelClass = 'block text-sm font-medium text-slate-200';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [requestType, setRequestType] = useState('general');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    const trimmedName = name.trim();

    // Client-side guards mirror the WITH CHECK constraints on the table.
    // The server enforces them too, but failing fast here gives a
    // friendlier message than Supabase's policy error.
    if (trimmedEmail.length < 5 || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      setState('error');
      return;
    }
    if (trimmedMessage.length < 10) {
      setErrorMessage(
        'Please write a message with at least 10 characters so we can help.',
      );
      setState('error');
      return;
    }

    setState('submitting');

    const { error } = await supabase.from('contact_messages').insert({
      name: trimmedName || null,
      email: trimmedEmail,
      request_type: requestType,
      message: trimmedMessage,
    });

    if (error) {
      // Don't echo the raw Supabase error to users — it might surface RLS
      // policy text. Log for debugging instead.
      console.error('Contact form submission failed:', error);
      setErrorMessage(
        'Something went wrong sending your message. Please email us directly at support@tradershindsight.com.',
      );
      setState('error');
      return;
    }

    setState('success');
    setName('');
    setEmail('');
    setRequestType('general');
    setMessage('');
  }

  if (state === 'success') {
    return (
      <div className='rounded-xl border border-indigo-400/30 bg-indigo-400/5 p-6'>
        <h2 className='text-lg font-semibold text-indigo-200'>
          Message received.
        </h2>
        <p className='mt-2 text-sm leading-relaxed text-slate-300'>
          Thanks for reaching out. We&apos;ve got your message and will get
          back to you within 2 business days. For urgent privacy requests, we
          aim to respond sooner.
        </p>
        <button
          type='button'
          onClick={() => setState('idle')}
          className='mt-4 text-sm text-indigo-300 underline-offset-4 hover:underline'>
          Send another message
        </button>
      </div>
    );
  }

  const isSubmitting = state === 'submitting';

  return (
    <form onSubmit={handleSubmit} className='space-y-5' noValidate>
      <div>
        <label htmlFor='contact-name' className={labelClass}>
          Name <span className='text-slate-500'>(optional)</span>
        </label>
        <input
          id='contact-name'
          name='name'
          type='text'
          autoComplete='name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className={`${inputClass} mt-1.5`}
          placeholder='Your name'
        />
      </div>

      <div>
        <label htmlFor='contact-email' className={labelClass}>
          Email
        </label>
        <input
          id='contact-email'
          name='email'
          type='email'
          autoComplete='email'
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          className={`${inputClass} mt-1.5`}
          placeholder='you@example.com'
        />
      </div>

      <div>
        <label htmlFor='contact-request-type' className={labelClass}>
          What can we help with?
        </label>
        <select
          id='contact-request-type'
          name='request_type'
          value={requestType}
          onChange={(e) => setRequestType(e.target.value)}
          className={`${inputClass} mt-1.5`}>
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value} className='bg-[#0b1220]'>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor='contact-message' className={labelClass}>
          Message
        </label>
        <textarea
          id='contact-message'
          name='message'
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          minLength={10}
          maxLength={5000}
          className={`${inputClass} mt-1.5 resize-y`}
          placeholder='Tell us what you need...'
        />
        <p className='mt-1.5 text-xs text-slate-500'>
          {message.trim().length}/5000 characters
        </p>
      </div>

      {state === 'error' && errorMessage && (
        <div className='rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100'>
          {errorMessage}
        </div>
      )}

      <button
        type='submit'
        disabled={isSubmitting}
        className='rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60'>
        {isSubmitting ? 'Sending...' : 'Send message'}
      </button>

      <p className='text-xs text-slate-500'>
        By submitting, you agree to our{' '}
        <a
          href='/privacy'
          className='text-slate-400 underline-offset-4 hover:underline'>
          Privacy Policy
        </a>
        . We&apos;ll only use this info to respond to your message.
      </p>
    </form>
  );
}
