import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        title: 'Test Modal',
        children: <p>Modal content</p>,
    };

    it('renders when isOpen is true', () => {
        render(<Modal {...defaultProps} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
        render(<Modal {...defaultProps} isOpen={false} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the title when provided', () => {
        render(<Modal {...defaultProps} />);
        expect(screen.getByText('Test Modal')).toBeInTheDocument();
    });

    it('calls onClose when backdrop is clicked', () => {
        const onClose = vi.fn();
        render(<Modal {...defaultProps} onClose={onClose} />);
        // The backdrop is the element with aria-hidden="true"
        const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onClose on backdrop click when closeOnBackdropClick is false', () => {
        const onClose = vi.fn();
        render(<Modal {...defaultProps} onClose={onClose} closeOnBackdropClick={false} />);
        const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
        fireEvent.click(backdrop);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when Escape key is pressed', () => {
        const onClose = vi.fn();
        render(<Modal {...defaultProps} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onClose on Escape when closeOnEscape is false', () => {
        const onClose = vi.fn();
        render(<Modal {...defaultProps} onClose={onClose} closeOnEscape={false} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('renders footer when provided', () => {
        render(
            <Modal {...defaultProps} footer={<button>Save</button>}>
                Content
            </Modal>
        );
        expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('has close button with accessible aria-label', () => {
        render(<Modal {...defaultProps} />);
        expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });

    it('has correct aria attributes on dialog', () => {
        render(<Modal {...defaultProps} />);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    });
});
