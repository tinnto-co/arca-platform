import { authClient } from "@/lib/auth-client";
import { useOrgSwitch } from "@/contexts/org-switch-context";
import { userQuery } from "../lib/user-query";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Building, ChevronsUpDown, Check } from "lucide-react";

type ListedOrg = {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
};

export function OrgSwitcher() {
  const { data: user } = useSuspenseQuery(userQuery);
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { runOrgSwitch } = useOrgSwitch();

  const displayName = user?.organizationName ?? activeOrg?.name;
  const displaySlug = user?.organizationSlug ?? activeOrg?.slug ?? "";
  const displayLogo = user?.organizationLogo ?? activeOrg?.logo ?? null;

  const handleSwitchOrg = async (orgId: string) => {
    const currentId = user?.activeOrganizationId ?? activeOrg?.id;
    if (orgId === currentId) return;
    const target = (organizations as ListedOrg[] | undefined)?.find(
      (o) => o.id === orgId
    );
    if (!target) return;

    const fromName =
      user?.organizationName ?? activeOrg?.name ?? "Organización actual";
    const fromLogo = user?.organizationLogo ?? activeOrg?.logo ?? null;

    await runOrgSwitch(
      {
        fromName,
        fromLogo,
        toName: target.name,
        toLogo: target.logo ?? null,
      },
      async () => {
        await authClient.organization.setActive({ organizationId: orgId });
        await queryClient.invalidateQueries();
        await navigate({ to: "/" });
      }
    );
  };

  const titleText =
    displayName ??
    (user?.activeOrganizationId ? "Cargando…" : "Sin organización");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-white/10">
                {displayLogo ? (
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={displayLogo} alt="" className="object-cover" />
                    <AvatarFallback className="rounded-lg bg-white/10">
                      <Building className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Building className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{titleText}</span>
                <span className="truncate text-xs text-white/60">
                  {displaySlug}
                </span>
              </div>
              {organizations && organizations.length > 1 && (
                <ChevronsUpDown className="ml-auto size-4" />
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          {organizations && organizations.length > 1 && (
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizaciones
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(organizations as ListedOrg[]).map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSwitchOrg(org.id)}
                  className="gap-2"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm border">
                    {org.logo ? (
                      <Avatar className="size-6 rounded-sm">
                        <AvatarImage src={org.logo} alt="" className="object-cover" />
                        <AvatarFallback className="rounded-sm text-[10px]">
                          {org.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Building className="size-4 shrink-0" />
                    )}
                  </div>
                  <span className="truncate">{org.name}</span>
                  {(org.id === user?.activeOrganizationId ||
                    org.id === activeOrg?.id) && (
                    <Check className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
