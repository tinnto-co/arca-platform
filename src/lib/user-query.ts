import { getUser } from "@/actions/user";

export const userQuery = {
  queryKey: ["user"] as const,
  queryFn: async () => getUser(),
};
