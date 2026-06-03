import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input, Textarea, SearchInput } from '@/components/ui/Input';

describe('Input', () => {
    it('renders an input element', () => {
        render(<Input placeholder="Type here" />);
        expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
    });

    it('renders a label when provided', () => {
        render(<Input label="Email" />);
        expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('displays error message', () => {
        render(<Input error="Required field" />);
        expect(screen.getByText('Required field')).toBeInTheDocument();
    });

    it('displays hint when no error', () => {
        render(<Input hint="Enter your email" />);
        expect(screen.getByText('Enter your email')).toBeInTheDocument();
    });

    it('hides hint when error is present', () => {
        render(<Input hint="Enter your email" error="Invalid" />);
        expect(screen.queryByText('Enter your email')).not.toBeInTheDocument();
        expect(screen.getByText('Invalid')).toBeInTheDocument();
    });

    it('fires onChange', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Input onChange={onChange} placeholder="test" />);
        await user.type(screen.getByPlaceholderText('test'), 'hello');
        expect(onChange).toHaveBeenCalledTimes(5); // one per char
    });

    it('renders left and right icons', () => {
        render(
            <Input
                leftIcon={<span data-testid="left" />}
                rightIcon={<span data-testid="right" />}
            />
        );
        expect(screen.getByTestId('left')).toBeInTheDocument();
        expect(screen.getByTestId('right')).toBeInTheDocument();
    });
});

describe('Textarea', () => {
    it('renders a textarea element', () => {
        render(<Textarea placeholder="Write here" />);
        expect(screen.getByPlaceholderText('Write here')).toBeInTheDocument();
    });

    it('renders label', () => {
        render(<Textarea label="Notes" />);
        expect(screen.getByText('Notes')).toBeInTheDocument();
    });

    it('displays error message', () => {
        render(<Textarea error="Too short" />);
        expect(screen.getByText('Too short')).toBeInTheDocument();
    });
});

describe('SearchInput', () => {
    it('calls onSearch when Enter is pressed', async () => {
        const user = userEvent.setup();
        const onSearch = vi.fn();
        render(<SearchInput onSearch={onSearch} placeholder="Search..." />);
        const input = screen.getByPlaceholderText('Search...');
        await user.type(input, 'test query{Enter}');
        expect(onSearch).toHaveBeenCalledWith('test query');
    });
});
