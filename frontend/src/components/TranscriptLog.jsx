import { useEffect, useRef } from 'react';

const EMOTION_COLORS = {
  sad: '#5cc8ff',
  happy: '#ffd23a',
  angry: '#ff3aa1',
  fear: '#a050ff',
  fearful: '#a050ff',
  neutral: '#7a3cff',
  surprise: '#ff8a3a',
  surprised: '#ff8a3a',
  calm: '#5cf2ff',
  excited: '#ff8fd1',
  disgusted: '#3affc8',
};

export default function TranscriptLog({ messages = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }, [messages.length]);

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <div>
          <div className="transcript-kicker">NEURAL TRANSCRIPT</div>
          <h2>Conversation</h2>
        </div>
      </div>

      <div className="transcript-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="transcript-empty">
            <div className="transcript-empty-icon" />
            <span>AWAITING INPUT</span>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const emotionColor = EMOTION_COLORS[msg.emotion] || EMOTION_COLORS.neutral;

            return (
              <article
                key={`${msg.role}-${index}-${msg.timestamp || index}`}
                className={`transcript-message ${isUser ? 'is-user' : 'is-assistant'}`}
                style={{ '--msg-accent': emotionColor }}
              >
                <div className="transcript-message-who">{isUser ? 'YOU' : 'EMPATHIX'}</div>
                <div className="transcript-message-text">{msg.text}</div>
                <div className="transcript-message-footer">
                  {isUser ? (
                    <span className="transcript-message-chip">
                      {msg.emotion || 'neutral'}
                      {msg.confidence != null ? ` ${Math.round(msg.confidence * 100)}%` : ''}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span>{formatTime(msg.timestamp)}</span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatTime(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
