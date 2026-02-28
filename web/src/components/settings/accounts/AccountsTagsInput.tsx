'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { formatAccountTagLabel } from '@/src/domain/account';

type AccountsTagsInputProps = {
  value: string[];
  inputValue: string;
  suggestions: string[];
  placeholder: string;
  disabled?: boolean;
  onInputChange: (next: string) => void;
  onAddTag: (raw: string) => void;
  onRemoveTag: (index: number) => void;
};

export function AccountsTagsInput({
  value,
  inputValue,
  suggestions,
  placeholder,
  disabled = false,
  onInputChange,
  onAddTag,
  onRemoveTag,
}: AccountsTagsInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const filteredSuggestions = useMemo(() => {
    const selected = new Set(value.map((tag) => tag.toLowerCase()));
    const query = inputValue.trim().toLowerCase();

    return suggestions
      .filter((tag) => !selected.has(tag.toLowerCase()))
      .filter((tag) => (query ? tag.toLowerCase().includes(query) : true))
      .slice(0, 6);
  }, [inputValue, suggestions, value]);

  const showSuggestions =
    isFocused && !disabled && filteredSuggestions.length > 0;

  function commitFromInput() {
    onAddTag(inputValue);
    onInputChange('');
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitFromInput();
      return;
    }

    if (e.key === 'Backspace' && !inputValue.trim() && value.length > 0) {
      e.preventDefault();
      onRemoveTag(value.length - 1);
    }
  }

  return (
    <div className='space-y-2'>
      <div className='relative'>
        <input
          className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setIsFocused(false), 80);
          }}
          placeholder={placeholder}
          disabled={disabled}
        />

        {showSuggestions && (
          <div className='absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[0_10px_28px_-20px_rgba(15,23,42,0.5)]'>
            {filteredSuggestions.map((tag) => (
              <button
                key={tag}
                type='button'
                className='block w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAddTag(tag);
                  onInputChange('');
                }}>
                {formatAccountTagLabel(tag)}
              </button>
            ))}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {value.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className='inline-flex items-center gap-1 rounded-full bg-[var(--neutral-badge)] px-2 py-1 text-[13px] leading-none text-[var(--neutral-text)]'>
              {formatAccountTagLabel(tag)}
              <button
                type='button'
                className='text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]'
                onClick={() => onRemoveTag(index)}
                disabled={disabled}
                aria-label={`Remove ${tag}`}>
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
