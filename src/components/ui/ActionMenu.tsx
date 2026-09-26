import React, { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Dialog } from './Dialog';
import { IconButton } from './IconButton';
import { Button } from './Button';

interface ActionMenuProps {
  label: string;
  actions: { label: string; icon: React.ElementType; onSelect: () => void; danger?: boolean }[];
}

/** A labelled action sheet keeps secondary actions usable by touch and keyboard. */
export function ActionMenu({ label, actions }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  return <>
    <IconButton icon={MoreHorizontal} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} />
    <Dialog open={open} onClose={() => setOpen(false)} title={label} maxWidth="sm">
      <div className="space-y-2">
        {actions.map(action => <Button key={action.label} fullWidth variant="secondary" leftIcon={action.icon}
          className={action.danger ? 'justify-start text-danger' : 'justify-start'}
          onClick={() => { setOpen(false); action.onSelect(); }}>
          {action.label}
        </Button>)}
      </div>
    </Dialog>
  </>;
}
