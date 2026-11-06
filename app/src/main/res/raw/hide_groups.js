// Hide group suggestions on search page
(() => {
  const hideLastGroupSuggestion = () => {
    if (window.location.href.includes('facebook.com/search')) {
      const parents = document.querySelectorAll('[data-is-h-scrollable]');
      const lastParent = parents[parents.length - 1]?.closest('.m.bg-s1');
      if (lastParent) lastParent.style.display = 'none';
    }
  };

  hideLastGroupSuggestion();
  nbSubscribe(hideLastGroupSuggestion);
})();

// Hide on comments
(() => {
  const hideGroupContainer = () => {
    if (!window.location.href.includes('facebook.com/story.php?') && !window.location.href.includes('facebook.com/groups')) return;

    const groupContainer = document.querySelector('h3[data-tti-phase="-1"].m');
    if (groupContainer) {
      const parent = groupContainer.closest('.m.bg-s2');
      if (parent) parent.style.display = 'none';
    }
  };

  hideGroupContainer();

  nbSubscribe(hideGroupContainer);
})();

