'use client';

import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useCopilotReadable } from '@copilotkit/react-core';

/**
 * Readable genérico de "lo que está en pantalla".
 *
 * Expone al agente CopilotKit el texto renderizado del área de contenido
 * principal (el contenedor marcado con `data-arca-content` en el layout
 * `_authed/route.tsx`). Sirve de red de seguridad para que el agente pueda
 * responder sobre cualquier cosa visible cuando no exista un readable
 * estructurado más específico para esa pantalla.
 *
 * Trade-off: es texto plano y se manda en cada mensaje, por eso se capea a
 * MAX_CHARS y se apunta solo al contenido (no a sidebar/menús).
 */
const MAX_CHARS = 4000;

export function VisiblePageReadable() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [snapshot, setSnapshot] = useState('');

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const getNode = () =>
      (document.querySelector('[data-arca-content]')) ??
      document.body;

    const read = () => {
      const text = (getNode()?.innerText ?? '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, MAX_CHARS);
      setSnapshot(text);
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRead = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, 400);
    };

    read();
    const obs = new MutationObserver(scheduleRead);
    obs.observe(getNode(), {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => {
      if (timer) clearTimeout(timer);
      obs.disconnect();
    };
  }, [pathname]);

  useCopilotReadable({
    description:
      'Texto actualmente visible en la pantalla del usuario (área de contenido principal). Usalo como contexto para responder preguntas sobre lo que el usuario está viendo en la pantalla actual cuando no haya un dato estructurado más específico disponible.',
    value: { ruta: pathname, contenidoVisible: snapshot },
  });

  return null;
}
