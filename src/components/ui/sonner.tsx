import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      // La descripción queda en el gris del sistema y no en el de Sonner, que
      // sobre nuestro fondo se lavaba hasta no leerse. Es donde va el detalle
      // que explica el aviso: si no se lee, el aviso no sirve.
      toastOptions={{
        classNames: {
          title: 'text-[13px] font-semibold text-[var(--arca-ink)]',
          description: '!text-[12.5px] !text-[var(--arca-ink-2)]',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
