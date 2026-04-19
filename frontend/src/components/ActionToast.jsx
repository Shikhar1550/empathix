export default function ActionToast({ toast }) {
  const { action = '', message = '' } = toast || {};

  return (
    <div className="action-toast">
      <span className="action-toast-icon" aria-hidden="true">
        <ToastIcon action={action} />
      </span>
      <span>{message}</span>
    </div>
  );
}

function ToastIcon({ action }) {
  if (action.includes('search')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="20" y1="20" x2="16.65" y2="16.65" />
      </svg>
    );
  }

  if (action.includes('spotify') || action.startsWith('media_')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
