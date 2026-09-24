'use client';

import { useCopilotReadable } from '@copilotkit/react-core';
import { useClientesCopilot } from './use-clientes-copilot';

/**
 * La cartera de clientes, siempre montada, para que el asistente pueda hablar
 * de una empresa desde cualquier pantalla.
 *
 * Acá no viaja ningún UUID, a propósito. Antes sí: cada entrada llevaba su
 * `clienteId` y las tools lo recibían como parámetro. Copiar 36 caracteres sin
 * equivocarse en ninguno es justo lo que un modelo hace mal, y el resultado
 * era navegar a la ficha de otra empresa —o a un id inventado— sin que nada
 * avisara. Ahora el modelo pasa el NOMBRE y el id lo resuelve el código
 * (`resolverCliente`), que no se equivoca y además puede decir "hay tres que
 * coinciden" en vez de elegir mal en silencio.
 *
 * La lista va entera, no recortada. Estaba capada en 100 y la organización
 * tiene más: los que quedaban afuera "no existían" para el asistente, que
 * respondía que no encontraba una empresa que sí está cargada.
 */
export function GlobalCopilotReadables() {
  const clientes = useClientesCopilot();

  useCopilotReadable({
    description:
      'Cartera completa de clientes del estudio. Cada entrada es una EMPRESA (entidad fiscal con CUIT propio). ' +
      '`logins` son los nombres de los accesos de ARCA por los que se la consulta — sirven para reconocerla cuando el usuario la llama por el titular del login, no son un dato navegable. ' +
      '`sueldos: true` significa que liquida sueldos. ' +
      'CÓMO USARLA: las tools reciben el NOMBRE de la empresa (`clientName`), nunca un id. Pasá la razón social tal como figura en esta lista; el sistema resuelve el id internamente y, si hay varias parecidas, te devuelve la lista para que le preguntes al usuario cuál. ' +
      'Si el usuario nombra una empresa que no está en esta lista, no existe en el estudio: decíselo, no inventes.',
    value: {
      totalClientes: clientes.length,
      clientes: clientes.map((c) => ({
        nombre: c.razonSocial,
        cuit: c.cuit,
        logins: c.credenciales,
        sueldos: c.liquidaSueldos,
      })),
    },
  });

  return null;
}
