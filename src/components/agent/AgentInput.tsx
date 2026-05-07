import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';

export function AgentInput() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    setValue('');

    navigate({
      to: '/chat/$id',
      params: { id },
      state: { initialMessage: text } as any,
    });
  };

  return (
    <div className="pointer-events-none sticky bottom-0 left-0 right-0 p-3 pb-20 md:pb-3 z-10">
      <div className="pointer-events-auto mx-auto max-w-2xl">
        <PromptInput
          onSubmit={handleSubmit}
          className="shadow-lg backdrop-blur-md bg-white/80 border-[var(--arca-border-strong)]"
        >
          <PromptInputBody>
            <PromptInputTextarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Preguntale al asistente sobre tus clientes..."
              className="!min-h-[36px] !max-h-[100px] text-sm"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <div className="flex items-center gap-1.5 text-[var(--arca-ink-3)]">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">Arca AI</span>
              </div>
            </PromptInputTools>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
