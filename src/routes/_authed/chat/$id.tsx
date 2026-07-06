import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/chat/$id')({
  beforeLoad: ({ params }) => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: '/chat', search: { id: params.id } });
  },
  component: () => null,
});
