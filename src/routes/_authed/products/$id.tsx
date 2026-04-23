import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/products/$id')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_authed/products/$"!</div>;
}
