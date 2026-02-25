import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card, CardHeader, CardBody, CardFooter, CardTitle, CardDescription } from '@/components/ui/Card';

describe('Card', () => {
    it('renders children', () => {
        render(<Card>Card content</Card>);
        expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<Card className="my-class">Content</Card>);
        expect(container.firstChild).toHaveClass('my-class');
    });

    it('sets role=button and tabIndex when onClick is provided', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Card onClick={onClick}>Clickable</Card>);
        const card = screen.getByRole('button');
        expect(card).toHaveAttribute('tabindex', '0');
        await user.click(card);
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('does not set role=button when no onClick', () => {
        render(<Card>Static</Card>);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders all variants without crashing', () => {
        const variants = ['default', 'elevated', 'outlined', 'glass'] as const;
        for (const variant of variants) {
            const { unmount } = render(<Card variant={variant}>{variant}</Card>);
            expect(screen.getByText(variant)).toBeInTheDocument();
            unmount();
        }
    });
});

describe('CardHeader', () => {
    it('renders children', () => {
        render(<CardHeader>Header text</CardHeader>);
        expect(screen.getByText('Header text')).toBeInTheDocument();
    });

    it('renders action when provided', () => {
        render(<CardHeader action={<button>Action</button>}>Title</CardHeader>);
        expect(screen.getByText('Action')).toBeInTheDocument();
    });
});

describe('CardBody', () => {
    it('renders children', () => {
        render(<CardBody>Body content</CardBody>);
        expect(screen.getByText('Body content')).toBeInTheDocument();
    });
});

describe('CardFooter', () => {
    it('renders children', () => {
        render(<CardFooter>Footer</CardFooter>);
        expect(screen.getByText('Footer')).toBeInTheDocument();
    });
});

describe('CardTitle', () => {
    it('renders as h3 heading', () => {
        render(<CardTitle>My Title</CardTitle>);
        const heading = screen.getByRole('heading', { level: 3 });
        expect(heading).toHaveTextContent('My Title');
    });
});

describe('CardDescription', () => {
    it('renders description text', () => {
        render(<CardDescription>A description</CardDescription>);
        expect(screen.getByText('A description')).toBeInTheDocument();
    });
});
