import * as React from "react";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  ChevronsUpDown,
  CreditCard,
  DollarSign,
  Home,
  LogOut,
  MessageCircle,
  Notebook,
  PinIcon,
  Plus,
  PlusCircle,
  Search,
  Table,
  Users,
  Box,
  Building,
  Briefcase,
  Loader2,
  User,
  ArrowLeftRight,
  Receipt,
  Mail,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getUser } from "@/actions/user";
import { CreateClientDialog } from "./create-client-dialog";

export const userQuery = {
  queryKey: ["user"],
  queryFn: async () => {
    const response = await getUser();
    return response;
  },
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar();
  // const { data: activeOrganization } = useSuspenseQuery(
  //   activeOrganizationQuery
  // );

  const [loading, setLoading] = useState(false);
  const { data: user } = useSuspenseQuery(userQuery);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(true);

  // Data for dialogs
  // const { data: brands = [] } = authClient.useListBrands
  //   ? authClient.useListBrands()
  //   : useQuery({ queryKey: ["brands"], queryFn: () => [] });
  // const { data: products = [] } = authClient.useListProducts
  //   ? authClient.useListProducts()
  //   : useQuery({ queryKey: ["products"], queryFn: () => [] });
  // const { data: templates = [] } = useQuery({
  //   queryKey: ["templates"],
  //   queryFn: () => [],
  // });
  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => [],
  });

  // const { data: activeOrganization } = authClient.useActiveOrganization();
  return (
    <>
      {/* Dialogs for Quick Create */}

      <Sidebar collapsible="icon" variant="floating" {...props}>
        <SidebarHeader>
          <div className="flex items-center justify-center gap-2">
            {open && <p className="text-sm text-black  px-2">GESTION ARCA</p>}
            <SidebarTrigger onClick={() => setOpen(!open)} className="-ml-1" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground duration-200 ease-linear">
                    <PlusCircle />
                    Crear nuevo
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <CreateClientDialog>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <User className="mr-2" />
                      Cliente
                    </DropdownMenuItem>
                  </CreateClientDialog>
                </DropdownMenuContent>
              </DropdownMenu>

              <SidebarMenuItem>
                <Link to="/">
                  <SidebarMenuButton isActive={pathname === "/"}>
                    <Home />
                    Home
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              {/* <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setOpen(true)}>
                  <Search />
                  Search
                </SidebarMenuButton>
              </SidebarMenuItem> */}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link to="/clients">
                  <SidebarMenuButton
                    isActive={pathname === "/clients"}
                    tooltip="Clientes"
                  >
                    <User />
                    <span>Clientes</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link to="/notifications">
                  <SidebarMenuButton
                    isActive={pathname === "/notifications"}
                    tooltip="Notificaciones"
                  >
                    <Mail />
                    <span>Notificaciones</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link to="/invoices">
                  <SidebarMenuButton
                    isActive={pathname === "/invoices"}
                    tooltip="Facturas"
                  >
                    <Receipt />
                    <span>Facturas</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    >
                      <Avatar className="h-8 w-8 rounded-lg">
                        {user?.image && (
                          <AvatarImage src={user?.image} alt={user?.name} />
                        )}
                        <AvatarFallback className="rounded-lg">
                          {user?.name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {user?.name}
                        </span>
                        <span className="truncate text-xs">{user?.email}</span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                    side={isMobile ? "bottom" : "right"}
                    align="end"
                    sideOffset={4}
                  >
                    <Link to="/profile">
                      <DropdownMenuItem className="p-0 font-normal">
                        <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                          <Avatar className="h-8 w-8 rounded-lg">
                            {user?.image && (
                              <AvatarImage src={user?.image} alt={user?.name} />
                            )}
                            <AvatarFallback className="rounded-lg">
                              {user?.name?.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="grid flex-1 text-left text-sm leading-tight">
                            <span className="truncate font-medium">
                              {user?.name}
                            </span>
                            <span className="truncate text-xs">
                              {user?.email}
                            </span>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    {/* <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Sparkles />
                    Upgrade to Pro
                  </DropdownMenuItem>
                </DropdownMenuGroup> */}
                    {/* <DropdownMenuGroup> */}
                    {/* <Link to="/account">
                      <DropdownMenuItem>
                        <BadgeCheck />
                        Account
                      </DropdownMenuItem>
                    </Link> */}
                    {/* <DropdownMenuItem>
                      <CreditCard />
                      Billing
                    </DropdownMenuItem> */}
                    {/* </DropdownMenuGroup> */}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => {
                        await authClient.signOut();
                        navigate({ to: "/login" });
                      }}
                    >
                      <LogOut />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        {/* <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter> */}
        <SidebarRail />
      </Sidebar>
    </>
  );
}
