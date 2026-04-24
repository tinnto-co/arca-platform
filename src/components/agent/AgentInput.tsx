import { Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

export function AgentInput() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    setValue('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: '/chat/$id', params: { id }, state: { initialMessage: text } as any });
  };

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-3 pb-20 md:pb-3">
      <form
        onSubmit={handleSubmit}
        className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-2 rounded-xl border border-border bg-white/80 px-4 py-2.5 shadow-lg backdrop-blur-md"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-[#139ed9]" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Preguntale al asistente sobre tus clientes..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="shrink-0 rounded-lg bg-[#232c50] p-1.5 text-white transition-colors hover:bg-[#139ed9] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
