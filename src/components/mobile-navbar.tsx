import { Link, useLocation } from '@tanstack/react-router';
import { Home, User, Bell, DollarSign, Menu } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/clients', icon: User, label: 'Clientes' },
  { to: '/notifications', icon: Bell, label: 'Alertas' },
  { to: '/sueldos', icon: DollarSign, label: 'Sueldos' },
] as const;

export function MobileNavbar() {
  const { pathname } = useLocation();
  const { toggleSidebar } = useSidebar();

  return (
    <nav className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
      <div className="bg-[#232c50] rounded-2xl shadow-2xl px-2 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-150',
                isActive ? 'bg-white/10 text-white' : 'text-white/60'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={toggleSidebar}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-white/60 transition-all duration-150"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Más</span>
        </button>
      </div>
    </nav>
  );
}
