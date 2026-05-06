import { createFileRoute } from '@tanstack/react-router';
import {
  CopilotRuntime,
  GoogleGenerativeAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { auth } from '@/lib/auth';

const SYSTEM_INSTRUCTIONS =
  'Sos Arca Asistente, integrado en la plataforma del estudio contable. Respondés siempre en español rioplatense, tono profesional y directo. Nunca inventás datos.';

const runtime = new CopilotRuntime();

const serviceAdapter = new GoogleGenerativeAIAdapter({
  apiKey: process.env.GEMINI_API_KEY!,
  model: 'gemini-2.5-flash',
});

const handle = async (request: Request): Promise<Response> => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }
  const orgId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId;
  if (!orgId) {
    return new Response('No active organization', { status: 403 });
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
    properties: {
      orgId,
      userId: session.user.id,
      systemInstructions: SYSTEM_INSTRUCTIONS,
    },
  });

  return handleRequest(request);
};

export const Route = createFileRoute('/api/copilotkit')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
