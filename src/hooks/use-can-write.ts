import { useQuery } from "@tanstack/react-query";
import { getUser } from "@/actions/user";

export function useCanWrite() {
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => getUser(),
  });

  const role = user?.organizationRole ?? "viewer";
  const canWrite = role !== "viewer";
  const isOwner = role === "owner";

  return { canWrite, isOwner, role };
}
