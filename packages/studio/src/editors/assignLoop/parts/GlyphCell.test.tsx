// Unit tests for GlyphCell.tsx (Fix B, #886).
//
// GlyphCell's click handler branches on RemovalCapability:
//   - "not-removable:*"  → clicking must NOT call onToggle; it must instead
//                          push a HoverInfo into the shared hoverInfoStore
//                          (the same info a hover/focus would set), so the
//                          user gets an explanation instead of a silent
//                          no-op or (pre-fix) an accidental toggle.
//   - "removable:*"      → clicking DOES call onToggle(gid).
//
// hoverInfoStore is a plain zustand store (no Provider needed) — read
// directly via useHoverInfoStore.getState() after firing the click.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GlyphCell } from './GlyphCell.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

afterEach(() => {
  cleanup();
  useHoverInfoStore.setState({ info: null });
});

const baseProps = {
  gid: 'rule#1',
  ch: 'ɛ',
  keys: ['K_Q'],
  off: false,
  color: 'var(--sil-green)',
  modifierLabel: '',
};

describe('GlyphCell — not-removable capability', () => {
  it('clicking does NOT call onToggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <GlyphCell {...baseProps} capability="not-removable:context-sensitive" onToggle={onToggle} />,
    );
    const button = container.querySelector('button')!;
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('clicking DOES set hover info via setInfo (explains why it cannot be removed)', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <GlyphCell {...baseProps} capability="not-removable:context-sensitive" onToggle={onToggle} />,
    );
    const button = container.querySelector('button')!;
    fireEvent.click(button);
    const info = useHoverInfoStore.getState().info;
    expect(info).not.toBeNull();
    expect(info).toMatchObject({
      kind: 'key',
      keys: baseProps.keys,
      ch: baseProps.ch,
      off: baseProps.off,
      capability: 'not-removable:context-sensitive',
    });
  });

  it('marks the button aria-disabled', () => {
    const { container } = render(
      <GlyphCell {...baseProps} capability="not-removable:unknown" onToggle={vi.fn()} />,
    );
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('GlyphCell — removable capability', () => {
  it('clicking DOES call onToggle(gid)', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <GlyphCell {...baseProps} capability="removable:simple" onToggle={onToggle} />,
    );
    const button = container.querySelector('button')!;
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('rule#1');
  });

  it('does not mark the button aria-disabled', () => {
    const { container } = render(
      <GlyphCell {...baseProps} capability="removable:slot-fill" onToggle={vi.fn()} />,
    );
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-disabled')).toBe('false');
  });
});
