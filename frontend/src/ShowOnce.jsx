import { useEffect, useRef, useState } from 'react';

// Shows a credential (API key, signing secret) the one time the backend ever
// returns it. The value only lives in this component's state -- never in
// localStorage or a URL -- and is gone once the parent unmounts it on Done.
function ShowOnce({ label, value, onDone }) {
  const fieldRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    function warnBeforeLeaving(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, []);

  function selectValue() {
    fieldRef.current?.select();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
    } catch {
      // No clipboard API (plain-HTTP preview) or permission denied.
      selectValue();
      setCopyStatus('manual');
    }
  }

  return (
    <div className="show-once">
      <p role="alert" className="show-once-warning">
        This is the only time you'll see this {label}. Copy it now and store it somewhere safe. If you
        lose it, you'll need to create a new one.
      </p>
      <div className="show-once-row">
        <input
          ref={fieldRef}
          className="show-once-value"
          aria-label={label}
          value={value}
          readOnly
          onFocus={selectValue}
        />
        <button type="button" className="btn-primary" onClick={handleCopy}>
          Copy
        </button>
      </div>
      {copyStatus === 'copied' && <p className="show-once-hint">Copied</p>}
      {copyStatus === 'manual' && <p className="show-once-hint">Press Ctrl/Cmd+C to copy</p>}
      <label className="show-once-confirm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I've saved it
      </label>
      <button type="button" className="btn-secondary" disabled={!saved} onClick={onDone}>
        Done
      </button>
    </div>
  );
}

export default ShowOnce;
