const STATUS = {
  idle: { label: 'READY', className: 'status-ready' },
  listening: { label: 'LISTENING', className: 'status-listening' },
  processing: { label: 'PROCESSING', className: 'status-processing' },
  speaking: { label: 'SPEAKING', className: 'status-speaking' },
  error: { label: 'ERROR', className: 'status-error' },
  offline: { label: 'OFFLINE', className: 'status-offline' },
};

export default function StatusBar({
  state = 'idle',
  interactions = 0,
  emotionsDetected = 0,
}) {
  const status = STATUS[state] || STATUS.idle;

  return (
    <header className="status-bar">
      <div className="status-block">
        <span className={`status-dot ${status.className}`} />
        <span className="status-label">{status.label}</span>
      </div>

      <div className="status-wordmark">E M P A T H I X</div>

      <div className="status-stats">
        {interactions} INTERACTION{interactions === 1 ? '' : 'S'} · {emotionsDetected} EMOTION{emotionsDetected === 1 ? '' : 'S'}
      </div>
    </header>
  );
}
