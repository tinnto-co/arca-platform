import { useCopilotReadable } from '@copilotkit/react-core';

interface CopilotReadableEntityProps {
  description: string;
  value: unknown;
}

export function CopilotReadableEntity({
  description,
  value,
}: CopilotReadableEntityProps) {
  useCopilotReadable({ description, value });
  return null;
}
