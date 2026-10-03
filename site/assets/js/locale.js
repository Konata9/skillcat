/* SkillCat landing — language routing.
   Sends first-time visitors to the page matching their browser language, while
   a saved choice (set by the in-page language switch) always wins. Loaded
   synchronously in <head> so the correct page renders without a flash. */
(function () {
  'use strict';

  try {
    var lang = document.documentElement.getAttribute('lang') || 'en';
    var current = lang === 'zh' || lang === 'zh-CN' ? 'zh' : 'en';

    var stored = null;
    try {
      stored = window.localStorage.getItem('skillcat-site-locale');
    } catch (err) {
      /* storage unavailable — fall back to browser detection */
    }

    var preferred;
    if (stored === 'zh' || stored === 'en') {
      preferred = stored;
    } else {
      var langs =
        navigator.languages && navigator.languages.length
          ? navigator.languages
          : [navigator.language || 'en'];
      preferred = String(langs[0] || 'en').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
    }

    if (preferred !== current) {
      window.location.replace(preferred === 'zh' ? '/zh/' : '/');
    }
  } catch (err) {
    /* never let routing break the page */
  }
})();
