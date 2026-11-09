import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShowOnce from './ShowOnce';

const VALUE = 'postie_0123456789abcdef0123456789abcdef0123456789abcdef';

// userEvent.setup() installs its own clipboard stub, so ours goes on after it.
function setup({ writeText } = {}) {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
  const onDone = vi.fn();
  const utils = render(<ShowOnce label="API key" value={VALUE} onDone={onDone} />);
  return { user, onDone, ...utils };
}

describe('ShowOnce', () => {
  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows the value in a read-only field, with the warning', () => {
    setup({ writeText: vi.fn() });

    const field = screen.getByRole('textbox', { name: 'API key' });
    expect(field).toHaveValue(VALUE);
    expect(field).toHaveAttribute('readonly');
    expect(screen.getByText(/only time you'll see this API key/i)).toBeInTheDocument();
  });

  test('Copy writes the exact value to the clipboard and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { user } = setup({ writeText });

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(VALUE);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  test('if the clipboard rejects, it selects the text and says how to copy by hand', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const { user } = setup({ writeText });

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(/press ctrl\/cmd\+c/i)).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'API key' });
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(VALUE.length);
  });

  test('if there is no clipboard API at all, it falls back the same way', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText(/press ctrl\/cmd\+c/i)).toBeInTheDocument();
  });

  test('Done stays disabled until "I\'ve saved it" is ticked', async () => {
    const { user, onDone } = setup({ writeText: vi.fn() });
    const done = screen.getByRole('button', { name: 'Done' });

    expect(done).toBeDisabled();
    await user.click(done);
    expect(onDone).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: /i've saved it/i }));
    expect(done).toBeEnabled();
    await user.click(done);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('asks before the tab is closed or refreshed, and stops asking once unmounted', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = setup({ writeText: vi.fn() });

    const added = add.mock.calls.find(([type]) => type === 'beforeunload');
    expect(added).toBeDefined();
    const handler = added[1];
    const event = new Event('beforeunload', { cancelable: true });
    handler(event);
    expect(event.defaultPrevented).toBe(true);

    unmount();
    expect(remove).toHaveBeenCalledWith('beforeunload', handler);
  });

  test('never stores the value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { user } = setup({ writeText });

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await user.click(screen.getByRole('checkbox', { name: /i've saved it/i }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });
});
