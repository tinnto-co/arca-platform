import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/products/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Productos</div>;
}
