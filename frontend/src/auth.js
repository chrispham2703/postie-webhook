// Reads the role out of the JWT payload so the UI can hide create forms from
// members. This is a display hint only: the token isn't verified here, and the
// server still enforces every write (a stale token gets a 403, which Setup
// handles). See docs/ONBOARDING_UI.md §3.4.
export function getRole(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role ?? null;
  } catch {
    return null;
  }
}

export function canWrite(role) {
  return role === 'owner' || role === 'admin';
}
