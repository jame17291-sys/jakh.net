(() => {
  const button = document.querySelector('[data-collection-share]');
  if (!button) return;

  const arabic = document.documentElement.lang === 'ar';
  const originalLabel = button.textContent;
  const title = document.querySelector('h1')?.textContent?.trim() || document.title;
  const description = document.querySelector('meta[name="description"]')?.content || '';

  button.addEventListener('click', async () => {
    const payload = { title, text: description, url: location.href };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(`${title}\n${location.href}`);
      button.textContent = arabic ? 'تم نسخ الرابط ✓' : 'Link copied ✓';
      window.setTimeout(() => { button.textContent = originalLabel; }, 2200);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        button.textContent = arabic ? 'تعذرت المشاركة' : 'Sharing unavailable';
        window.setTimeout(() => { button.textContent = originalLabel; }, 2200);
      }
    }
  });
})();
