import { useEffect, useRef } from 'react';

/**
 * TranscriptLog — Scrollable conversation log with user/EMPATHIX messages.
 *
 * Props:
 *   messages  — [{ role: 'user'|'assistant', text, emotion?, confidence? }]
 *   emotionColor — current accent color
 */

const EMOTION_COLORS = {
  sad:       '#4A90D9',
  happy:     '#F5C842',
  angry:     '#E8453C',
  fear:      '#9B59B6',
  fearful:   '#9B59B6',
  neutral:   '#7F8C8D',
  surprise:  '#E67E22',
  surprised: '#E67E22',
  calm:      '#22D3EE',
  excited:   '#F472B6',
  disgusted: '#4ADE80',
};

export default function TranscriptLog({ messages = [] }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages.length]);

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <h2>Conversation</h2>
      </div>

      <div className="transcript-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: 12,
              opacity: 0.3,
              padding: '40px 20px',
              textAlign: 'center',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ fontSize: 12, letterSpacing: 1 }}>
              Start speaking to begin
            </span>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const emotionColor =
              EMOTION_COLORS[msg.emotion] || EMOTION_COLORS.neutral;

            return (
              <div
                key={idx}
                className={`transcript-message ${
                  isUser ? 'transcript-msg-user' : 'transcript-msg-ai'
                }`}
                style={{
                  animationDelay: `${Math.min(idx * 0.05, 0.3)}s`,
                }}
              >
                <div className="msg-label">
                  {isUser ? 'You' : 'EMPATHIX'}
                </div>
                <div
                  className="msg-bubble"
                  style={
                    !isUser
                      ? { '--msg-accent-color': emotionColor }
                      : undefined
                  }
                >
                  {msg.text}
                </div>
                {/* Emotion chip for user messages */}
                {isUser && msg.emotion && (
                  <div
                    className="msg-emotion-chip"
                    style={{ color: emotionColor }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: emotionColor,
                        display: 'inline-block',
                      }}
                    />
                    {msg.emotion}
                    {msg.confidence != null && (
                      <span style={{ opacity: 0.6 }}>
                        {Math.round(msg.confidence * 100)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
