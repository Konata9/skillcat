/* SkillCat landing — hero type-in · sticky CTA · locale memory.
   No dependencies. Everything degrades to a readable static page without JS. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero type-in (plays once, then static) ---------- */
  var typeTarget = document.querySelector('[data-type]');
  if (typeTarget && !reduceMotion) {
    var full = typeTarget.getAttribute('data-type') || typeTarget.textContent;
    var caret = document.querySelector('.type-caret');
    typeTarget.textContent = '';
    if (caret) caret.hidden = false;

    var i = 0;
    var tick = function () {
      if (i >= full.length) {
        if (caret) caret.hidden = true;
        return;
      }
      typeTarget.textContent += full.charAt(i);
      i += 1;
      window.setTimeout(tick, 18);
    };
    window.setTimeout(tick, 420);
  }

  /* ---------- Sticky CTA (C4) ----------
     Appears once the hero has scrolled out of view, and hides again over the
     footer. A passive scroll handler is used instead of IntersectionObserver
     because the observer only fires on threshold crossings and reports the
     hero's bottom as ~0 exactly when it leaves. */
  var sticky = document.querySelector('.sticky-cta');
  var hero = document.querySelector('.hero');
  var footer = document.getElementById('footer');

  if (sticky && hero) {
    var dismissed = false;

    var update = function () {
      if (dismissed) return;
      var pastHero = hero.getBoundingClientRect().bottom < 0;
      var atFooter = footer ? footer.getBoundingClientRect().top < window.innerHeight : false;
      sticky.setAttribute('data-visible', pastHero && !atFooter ? 'true' : 'false');
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    var close = sticky.querySelector('.sticky-cta__close');
    if (close) {
      close.addEventListener('click', function () {
        dismissed = true;
        sticky.setAttribute('data-visible', 'false');
        sticky.setAttribute('data-dismissed', 'true');
        sticky.hidden = true;
      });
    }
  }

  /* ---------- Remember the language choice for next visit ---------- */
  document.querySelectorAll('[data-set-locale]').forEach(function (link) {
    link.addEventListener('click', function () {
      try {
        window.localStorage.setItem('skillcat-site-locale', link.getAttribute('data-set-locale'));
      } catch (err) {
        /* storage unavailable — the link still navigates */
      }
    });
  });
})();
