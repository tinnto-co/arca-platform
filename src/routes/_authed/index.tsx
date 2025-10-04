import { Button } from "@/components/ui/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

async function readCount() {
  return parseInt("0");
}

const getCount = createServerFn({
  method: "GET",
}).handler(() => {
  return readCount();
});

const updateCount = createServerFn({ method: "POST" })
  .inputValidator((d: number) => d)
  .handler(async ({ data }) => {
    const count = await readCount();
  });

export const Route = createFileRoute("/_authed/")({
  component: Home,
  loader: async () => await getCount(),
});

function Home() {
  const router = useRouter();
  const state = Route.useLoaderData();

  return <p>Hola mundo!</p>;
}
