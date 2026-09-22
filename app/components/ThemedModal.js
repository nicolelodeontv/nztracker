'use client';

import { useEffect, useRef, useState } from 'react';

export default function ThemedModal({
  open,
  variant = 'confirm',
  eyebrow = 'SYSTEM',
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  defaultValue = '',
  placeholder = '',
  inputType = 'text',
  inputValue,
  onInputChange,
  children
}) {
  const dialogRef = useRef(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isInputVariant = variant === 'prompt';

  useEffect(() => {
    if (!open) return;
    setInternalValue(defaultValue);
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, defaultValue, onCancel]);

  if (!open) return null;

  const value = inputValue ?? internalValue;
  const handleInput = (event) => {
    const next = event.target.value;
    if (onInputChange) onInputChange(next);
    else setInternalValue(next);
  };

  const handleConfirm = () => onConfirm?.(value);

  return (
    <div
      className="themed-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <section
        ref={dialogRef}
        className={`themed-modal themed-modal-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="themed-modal-title"
        aria-describedby={message ? 'themed-modal-message' : undefined}
        tabIndex="-1"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-btn themed-modal-close"
          type="button"
          aria-label="Close dialog"
          onClick={onCancel}
        >
          ×
        </button>
        <span className="eyebrow">{eyebrow}</span>
        <h3 id="themed-modal-title">{title}</h3>
        {message && <p id="themed-modal-message">{message}</p>}
        {isInputVariant && (
          <input
            autoFocus
            className="themed-modal-input"
            type={inputType}
            value={value}
            onChange={handleInput}
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleConfirm();
              }
            }}
          />
        )}
        {children}
        <div className="themed-modal-actions">
          {cancelLabel && (
            <button className="btn" type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            className={`btn full-confirm ${destructive ? 'danger' : 'primary'}`}
            type="button"
            onClick={handleConfirm}
          >
            {confirmLabel || (variant === 'alert' ? 'OK' : variant === 'prompt' ? 'OK' : 'CONFIRM')}
          </button>
        </div>
      </section>
    </div>
  );
}
