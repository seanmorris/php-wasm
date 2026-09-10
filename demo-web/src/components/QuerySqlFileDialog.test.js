import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuerySqlFileDialog from './QuerySqlFileDialog';

describe('QuerySqlFileDialog', () => {
	it.each(['save', 'load'])('prompts for a transient %s path and confirms the entered value', mode => {
		const onConfirm = vi.fn();
		const action = mode === 'save' ? 'Save' : 'Load';
		render(<QuerySqlFileDialog mode={mode} initialPath="/persist/original.sql" onConfirm={onConfirm} onCancel={vi.fn()} />);
		expect(screen.getByRole('dialog', {name: `${action} SQL`})).toHaveAttribute('aria-modal', 'true');
		const input = screen.getByRole('textbox', {name: 'SQL file path'});
		expect(input).toHaveValue('/persist/original.sql');
		expect(input).toHaveFocus();
		fireEvent.change(input, {target: {value: '/persist/queries/test query.sql'}});
		fireEvent.click(screen.getByRole('button', {name: action}));
		expect(onConfirm).toHaveBeenCalledExactlyOnceWith('/persist/queries/test query.sql');
	});

	it.each([
		''
		, 'relative.sql'
		, '/outside/query.sql'
		, '/persist-not/query.sql'
		, '/persist/query.txt'
		, '/persist/../query.sql'
		, '/persist/./query.sql'
		, '/persist/folder/../query.sql'
		, '/persist/query\0.sql'
	])('rejects invalid SQL file path %j without confirming', path => {
		const onConfirm = vi.fn();
		render(<QuerySqlFileDialog mode="save" initialPath={path} onConfirm={onConfirm} onCancel={vi.fn()} />);
		fireEvent.click(screen.getByRole('button', {name: 'Save'}));
		expect(onConfirm).not.toHaveBeenCalled();
		expect(screen.getByRole('alert')).toHaveTextContent('Choose a .sql file inside /persist/');
		expect(screen.getByRole('textbox', {name: 'SQL file path'})).toHaveAttribute('aria-invalid', 'true');
		expect(screen.getByRole('textbox', {name: 'SQL file path'})).toHaveFocus();
	});

	it('clears validation feedback when the path is corrected', () => {
		const onConfirm = vi.fn();
		render(<QuerySqlFileDialog mode="load" initialPath="invalid" onConfirm={onConfirm} onCancel={vi.fn()} />);
		fireEvent.click(screen.getByRole('button', {name: 'Load'}));
		fireEvent.change(screen.getByRole('textbox', {name: 'SQL file path'}), {target: {value: '/persist/✓ query.sql'}});
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		expect(screen.getByRole('textbox', {name: 'SQL file path'})).toHaveAttribute('aria-invalid', 'false');
		fireEvent.click(screen.getByRole('button', {name: 'Load'}));
		expect(onConfirm).toHaveBeenCalledExactlyOnceWith('/persist/✓ query.sql');
	});

	it('submits with Enter from the path input', async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		render(<QuerySqlFileDialog mode="save" initialPath="/persist/enter.sql" onConfirm={onConfirm} onCancel={vi.fn()} />);
		await user.keyboard('{Enter}');
		expect(onConfirm).toHaveBeenCalledExactlyOnceWith('/persist/enter.sql');
	});

	it.each(['button', 'Escape'])('cancels through %s without submitting', method => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		render(<QuerySqlFileDialog mode="load" initialPath="/persist/query.sql" onConfirm={onConfirm} onCancel={onCancel} />);
		if(method === 'button')
		{
			fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
		}
		else
		{
			fireEvent.keyDown(screen.getByRole('textbox', {name: 'SQL file path'}), {key: 'Escape'});
		}
		expect(onCancel).toHaveBeenCalledOnce();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it('keeps Tab focus within the dialog and restores the opener on close', async () => {
		const user = userEvent.setup();
		const opener = document.createElement('button');
		opener.textContent = 'Open path dialog';
		document.body.append(opener);
		opener.focus();
		const {unmount} = render(<QuerySqlFileDialog mode="save" initialPath="/persist/query.sql" onConfirm={vi.fn()} onCancel={vi.fn()} />);
		const input = screen.getByRole('textbox', {name: 'SQL file path'});
		expect(input).toHaveFocus();
		await user.tab({shift: true});
		expect(screen.getByRole('button', {name: 'Cancel'})).toHaveFocus();
		await user.tab();
		expect(input).toHaveFocus();
		await user.tab();
		expect(screen.getByRole('button', {name: 'Save'})).toHaveFocus();
		await user.tab();
		expect(screen.getByRole('button', {name: 'Cancel'})).toHaveFocus();
		unmount();
		expect(opener).toHaveFocus();
		opener.remove();
	});

	it('uses a default path when one is not provided', () => {
		render(<QuerySqlFileDialog mode="load" onConfirm={vi.fn()} onCancel={vi.fn()} />);
		expect(screen.getByRole('textbox', {name: 'SQL file path'})).toHaveValue('/persist/query.sql');
	});
});
