
export function getUserId() {
  if (typeof window === 'undefined') return null; // sunucu tarafında çalışmasın

  let userId = localStorage.getItem('geomorphosis_user_id');

  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('geomorphosis_user_id', userId);
  }

  return userId;
}