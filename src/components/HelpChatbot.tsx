import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquareMore, X, Send, Bot, User, Loader2, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-chat`;

function stripMarkdown(md: string): string {
  return md
    .replace(/[#*_~`>\-\[\]()!|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();
}

export default function HelpChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "👋 Hi! I'm the HRL RMS Help Assistant. Ask me anything about using the portal — recording repayments, creating loans, reconciliation, and more!" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSpokenRef = useRef<number>(-1);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Auto-read new assistant messages
  useEffect(() => {
    if (!ttsEnabled || loading) return;
    const lastIdx = messages.length - 1;
    const lastMsg = messages[lastIdx];
    if (lastMsg?.role === 'assistant' && lastIdx > lastSpokenRef.current && lastIdx > 0) {
      lastSpokenRef.current = lastIdx;
      speakText(stripMarkdown(lastMsg.content));
    }
  }, [messages, loading, ttsEnabled]);

  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.88;
    utterance.pitch = 1.08;
    utterance.volume = 0.95;

    // Pick the most natural-sounding female voice available
    const voices = window.speechSynthesis.getVoices();
    const preferredNames = [
      'Samantha', 'Karen', 'Microsoft Zira', 'Google UK English Female',
      'Moira', 'Fiona', 'Victoria', 'Tessa', 'Catherine', 'Hazel',
      'Google US English', 'Susan', 'Serena', 'Martha', 'Nicky',
    ];
    const femaleVoice =
      voices.find(v => preferredNames.some(p => v.name.includes(p))) ||
      voices.find(v => /female|woman/i.test(v.name)) ||
      voices.find(v => v.lang.startsWith('en') && /female|woman|samantha|karen|zira|hazel|susan|catherine|moira|tessa|victoria|serena|martha/i.test(v.name)) ||
      voices.find(v => v.lang.startsWith('en')) ||
      null;
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled(prev => {
      if (prev) stopSpeaking();
      return !prev;
    });
  }, [stopSpeaking]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    stopSpeaking();
    const userMsg: Msg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    let assistantSoFar = '';

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && prev.length > 1 && prev[prev.length - 2].role === 'user') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const allMessages = [...messages, userMsg].filter((_, i) => i > 0);
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I couldn't process that. ${e.message || 'Please try again.'}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, stopSpeaking]);

  const quickQuestions = [
    'How do I record a loan repayment?',
    'How to create a new loan?',
    'How does reconciliation work?',
  ];

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 p-3.5 rounded-full gradient-primary text-primary-foreground shadow-elevated hover:scale-105 transition-transform"
          title="Help Assistant"
        >
          <MessageSquareMore className="w-5 h-5" />
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[360px] max-h-[520px] flex flex-col rounded-xl border border-border bg-card shadow-elevated overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 gradient-primary text-primary-foreground">
            <Bot className="w-5 h-5" />
            <span className="text-sm font-semibold flex-1">HRL RMS Help Assistant</span>
            <button
              onClick={toggleTts}
              className={cn("p-1 rounded transition-colors", ttsEnabled ? "hover:bg-white/20" : "bg-white/20")}
              title={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button onClick={() => { setOpen(false); stopSpeaking(); }} className="p-1 hover:bg-white/20 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[280px] max-h-[360px]">
            {messages.map((m, i) => (
              <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs max-w-[80%]',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  )}
                >
                  {m.role === 'assistant' ? (
                    <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-accent-foreground" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                </div>
                <div className="bg-secondary rounded-lg px-3 py-2 text-xs text-muted-foreground">Thinking...</div>
              </div>
            )}

            {/* Quick questions on first load */}
            {messages.length === 1 && (
              <div className="space-y-1.5 pt-1">
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="px-3 py-1.5 bg-primary/5 border-t border-border flex items-center gap-2 text-xs text-primary">
              <Volume2 className="w-3 h-3 animate-pulse" />
              <span>Reading aloud...</span>
              <button onClick={stopSpeaking} className="ml-auto text-muted-foreground hover:text-foreground text-[10px] underline">Stop</button>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask a question..."
              className="flex-1 text-xs bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="p-2 rounded-lg gradient-primary text-primary-foreground disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
