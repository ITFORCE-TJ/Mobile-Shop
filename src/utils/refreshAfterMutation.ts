/** A committed write must never be reported as failed because a subsequent GET failed. */
export async function refreshAfterMutation(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks);
  window.dispatchEvent(new Event('business-data-refreshed'));
  if (results.some(r => r.status === 'rejected')) {
    window.alert('Операция сохранена. Не удалось обновить все данные. Обновите страницу; повторять операцию не нужно.');
  }
}
