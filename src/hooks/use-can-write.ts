import { useQuery } from '@tanstack/react-query';
import { getUser } from '@/actions/user';
import { mandaEnElEstudio } from '@/lib/permissions';

export function useCanWrite() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
  });

  const role = user?.organizationRole ?? 'viewer';
  const canWrite = role !== 'viewer';
  const isOwner = mandaEnElEstudio(role);

  return { canWrite, isOwner, role };
}
