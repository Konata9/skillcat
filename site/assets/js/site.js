/* SkillCat landing — hero type-in · sticky CTA.
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

  /* ---------- Tour carousel (native scroll-snap track, looping) ---------- */
  var carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    var track = carousel.querySelector('[data-carousel-track]');
    var originals = Array.prototype.slice.call(carousel.querySelectorAll('.carousel__slide'));
    var prevBtn = carousel.querySelector('[data-carousel-prev]');
    var nextBtn = carousel.querySelector('[data-carousel-next]');
    var dots = Array.prototype.slice.call(carousel.querySelectorAll('[data-carousel-goto]'));
    var current = carousel.querySelector('[data-carousel-current]');
    var count = originals.length;
    var realIndex = -1;
    var pendingReal = null;

    // Looping is built at runtime from two clones of the end slides, so the
    // track reads [lastClone] [1..n] [firstClone] and the served HTML still
    // contains exactly the n real slides.
    var makeClone = function (slide) {
      var clone = slide.cloneNode(true);
      clone.setAttribute('data-clone', '');
      clone.setAttribute('aria-hidden', 'true');
      var img = clone.querySelector('img');
      if (img) img.setAttribute('alt', '');
      return clone;
    };

    var looping = count > 1;
    if (looping) {
      track.insertBefore(makeClone(originals[count - 1]), originals[0]);
      track.appendChild(makeClone(originals[0]));
    }

    var slides = Array.prototype.slice.call(track.querySelectorAll('.carousel__slide'));
    var first = looping ? 1 : 0;
    var last = slides.length - 1;

    var pitch = function () {
      return slides.length < 2 ? track.clientWidth : slides[1].offsetLeft - slides[0].offsetLeft;
    };
    var leftOf = function (i) {
      return slides[i].offsetLeft - slides[0].offsetLeft;
    };
    var clamp = function (i) {
      return Math.max(0, Math.min(last, i));
    };
    var rawAt = function () {
      var step = pitch();
      return step ? clamp(Math.round(track.scrollLeft / step)) : first;
    };
    var realOf = function (raw) {
      return (((raw - first) % count) + count) % count;
    };

    var paint = function (raw) {
      var r = realOf(raw);
      if (r === realIndex) return;
      realIndex = r;
      if (current) current.textContent = (r + 1 < 10 ? '0' : '') + (r + 1);
      dots.forEach(function (dot, d) {
        if (d === r) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    };

    var jump = function (i) {
      track.scrollLeft = leftOf(clamp(i));
    };

    /* Navigation works in real-slide space so rapid clicks accumulate: while a
       scroll is in flight we count from the pending target, not from the
       mid-animation scroll position. Crossing the seam scrolls into the clone
       on that side, and the settle handler silently swaps it for the real one. */
    var anchorReal = function () {
      return pendingReal === null ? realIndex : pendingReal;
    };
    var goReal = function (r, animate) {
      r = ((r % count) + count) % count;
      var from = anchorReal();
      var raw;
      if (!looping) raw = r;
      else if (from === count - 1 && r === 0) raw = last; // forward across the seam
      else if (from === 0 && r === count - 1) raw = 0; // backward across the seam
      else raw = r + first;
      pendingReal = r;
      track.scrollTo({
        left: leftOf(clamp(raw)),
        behavior: animate && !reduceMotion ? 'smooth' : 'auto',
      });
    };
    var stepBy = function (delta) {
      goReal(anchorReal() + delta, true);
    };

    if (looping) jump(first);
    paint(first);

    var settleTimer = null;
    var ticking = false;

    track.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(function () {
            ticking = false;
            paint(rawAt());
          });
        }
        if (!looping) return;
        // Once the scroll has settled, silently swap a clone for its real slide.
        if (settleTimer) window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(function () {
          var raw = rawAt();
          pendingReal = null;
          if (raw === 0) jump(count);
          else if (raw === last) jump(first);
        }, 140);
      },
      { passive: true },
    );

    if (prevBtn) prevBtn.addEventListener('click', function () { stepBy(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { stepBy(1); });
    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        goReal(Number(dot.getAttribute('data-carousel-goto')), true);
      });
    });

    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepBy(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepBy(-1);
      }
    });

    window.addEventListener('resize', function () {
      var i = realIndex + first;
      jump(i);
      paint(i);
    });
  }

  /* ---------- Sticky CTA (C4) ---------- */
  var sticky = document.querySelector('.sticky-cta');
  var tour = document.getElementById('tour');
  var footer = document.getElementById('footer');

  if (sticky && tour && 'IntersectionObserver' in window) {
    var pastTour = false;
    var atFooter = false;

    var sync = function () {
      sticky.setAttribute('data-visible', pastTour && !atFooter ? 'true' : 'false');
    };

    new IntersectionObserver(
      function (entries) {
        pastTour = entries[0].boundingClientRect.top < 0;
        sync();
      },
      { threshold: 0 },
    ).observe(tour);

    if (footer) {
      new IntersectionObserver(
        function (entries) {
          atFooter = entries[0].isIntersecting;
          sync();
        },
        { threshold: 0 },
      ).observe(footer);
    }

    var close = sticky.querySelector('.sticky-cta__close');
    if (close) {
      close.addEventListener('click', function () {
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
