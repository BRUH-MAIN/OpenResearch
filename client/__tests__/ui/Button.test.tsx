import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
    it('renders children text', () => {
        render(<Button>Click me</Button>);
        expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('calls onClick handler when clicked', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Click</Button>);
        await user.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('is disabled when disabled prop is true', () => {
        render(<Button disabled>Disabled</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('is disabled and marked busy when isLoading is true', () => {
        render(<Button isLoading>Save</Button>);
        const btn = screen.getByRole('button');

        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('aria-busy', 'true');
        // The label stays put and a spinner joins it, rather than the label being
        // swapped for "Loading..." — the button keeps its width, so it does not
        // jump out from under the cursor mid-click.
        expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('does not fire onClick when disabled', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button disabled onClick={onClick}>No click</Button>);
        await user.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('renders left and right icons', () => {
        render(
            <Button leftIcon={<span data-testid="left-icon" />} rightIcon={<span data-testid="right-icon" />}>
                Icons
            </Button>
        );
        expect(screen.getByTestId('left-icon')).toBeInTheDocument();
        expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('applies custom className', () => {
        render(<Button className="custom-class">Styled</Button>);
        expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('renders all size variants without crashing', () => {
        const sizes = ['sm', 'md', 'lg'] as const;
        for (const size of sizes) {
            const { unmount } = render(<Button size={size}>Size {size}</Button>);
            expect(screen.getByRole('button')).toBeInTheDocument();
            unmount();
        }
    });

    it('renders all variants without crashing', () => {
        const variants = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
        for (const variant of variants) {
            const { unmount } = render(<Button variant={variant}>{variant}</Button>);
            expect(screen.getByRole('button')).toBeInTheDocument();
            unmount();
        }
    });
});
