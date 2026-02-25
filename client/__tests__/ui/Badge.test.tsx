import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, StatusBadge } from '@/components/ui/Badge';

describe('Badge', () => {
    it('renders children text', () => {
        render(<Badge>New</Badge>);
        expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders all variants without crashing', () => {
        const variants = ['primary', 'secondary', 'success', 'warning', 'danger', 'info', 'outline'] as const;
        for (const variant of variants) {
            const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
            expect(screen.getByText(variant)).toBeInTheDocument();
            unmount();
        }
    });

    it('renders all sizes without crashing', () => {
        const sizes = ['sm', 'md', 'lg'] as const;
        for (const size of sizes) {
            const { unmount } = render(<Badge size={size}>Size {size}</Badge>);
            expect(screen.getByText(`Size ${size}`)).toBeInTheDocument();
            unmount();
        }
    });

    it('renders a dot indicator when dot=true', () => {
        const { container } = render(<Badge dot variant="success">Active</Badge>);
        // Dot is a span with animate-pulse class
        const dot = container.querySelector('.animate-pulse');
        expect(dot).toBeInTheDocument();
    });

    it('does not render dot when dot=false', () => {
        const { container } = render(<Badge>No dot</Badge>);
        const dot = container.querySelector('.animate-pulse');
        expect(dot).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<Badge className="extra">Styled</Badge>);
        expect(container.firstChild).toHaveClass('extra');
    });
});

describe('StatusBadge', () => {
    it('renders all statuses', () => {
        const statuses = ['online', 'offline', 'busy', 'away'] as const;
        for (const status of statuses) {
            const { unmount } = render(<StatusBadge status={status} />);
            expect(screen.getByText(status.charAt(0).toUpperCase() + status.slice(1))).toBeInTheDocument();
            unmount();
        }
    });

    it('hides label when showLabel is false', () => {
        render(<StatusBadge status="online" showLabel={false} />);
        expect(screen.queryByText('Online')).not.toBeInTheDocument();
    });
});
