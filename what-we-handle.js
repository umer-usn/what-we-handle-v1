/* "What we handle" — endless card carousel that auto-scrolls.
 *
 * - Each card rests under the heading for DWELL ms, then glides up to the next
 *   one over GLIDE ms (the CSS mask fades it out behind the heading).
 * - The list is cloned so it loops forever, in both directions.
 * - Auto-scroll pauses while the user hovers, focuses, touches or wheels the panel,
 *   and resumes RESUME ms after they stop.
 * - It also pauses when the block is off-screen or the tab is hidden, and is off
 *   entirely for users who prefer reduced motion.
 *
 * Tune with data attributes on the scroller: data-dwell, data-glide, data-resume (ms).
 */
(function () {
  var scroller = document.querySelector('[data-wwh="scroller"]');
  if (!scroller) return;
  var list = scroller.querySelector('.wwh-list');
  var originals = Array.prototype.slice.call(list.children);
  if (originals.length < 2) return;

  var DWELL  = +scroller.dataset.dwell  || 3200;
  var GLIDE  = +scroller.dataset.glide  || 900;
  var RESUME = +scroller.dataset.resume || 4000;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // --- Build the loop: [clone set][original set][clone set] -----------------
  function clones() {
    return originals.map(function (el) {
      var c = el.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      return c;
    });
  }
  clones().forEach(function (c) { list.insertBefore(c, originals[0]); });
  clones().forEach(function (c) { list.appendChild(c); });
  list.classList.add('is-loop');
  scroller.classList.add('is-loop');

  // --- Geometry -------------------------------------------------------------
  var step = 0, cycle = 0;
  function measure() {
    var a = originals[0], b = originals[1];
    step = b.offsetTop - a.offsetTop;      // card height + gap
    cycle = step * originals.length;       // one full set
  }

  // Keep scrollTop inside the middle set so there is always content both ways.
  var animating = false;
  function wrap() {
    if (animating || !cycle) return;
    var t = scroller.scrollTop;
    if (t >= cycle * 2)  scroller.scrollTop = t - cycle;
    else if (t < cycle)  scroller.scrollTop = t + cycle;
  }

  // --- Gliding --------------------------------------------------------------
  var raf = 0;
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function glideTo(target, done) {
    cancelAnimationFrame(raf);
    var from = scroller.scrollTop, delta = target - from, start = null;
    animating = true;
    function frame(now) {
      if (start === null) start = now;
      var p = Math.min(1, (now - start) / GLIDE);
      scroller.scrollTop = from + delta * easeInOut(p);
      if (p < 1) { raf = requestAnimationFrame(frame); }
      else { animating = false; wrap(); if (done) done(); }
    }
    raf = requestAnimationFrame(frame);
  }

  function next() {
    wrap();
    var current = scroller.scrollTop;
    // next resting position on the card grid (works even if the user left it mid-card)
    var target = (Math.floor(current / step + 0.01) + 1) * step;
    glideTo(target);
  }

  // --- Auto-play control ----------------------------------------------------
  var timer = 0, held = {}, visible = true, resumeTimer = 0;

  function canPlay() {
    return !reduceMotion.matches && visible && !document.hidden &&
           !held.hover && !held.focus && !held.touch && !held.user;
  }
  function stopTimer() { clearTimeout(timer); timer = 0; }
  function schedule(delay) {
    stopTimer();
    if (!canPlay()) return;
    timer = setTimeout(function () {
      if (!canPlay()) return;
      next();
      schedule(GLIDE + DWELL);
    }, delay);
  }
  function hold(key) {
    held[key] = true;
    stopTimer();
    // a manual hold interrupts a glide in flight
    cancelAnimationFrame(raf); animating = false;
  }
  function release(key, delay) { held[key] = false; schedule(delay == null ? DWELL : delay); }

  scroller.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hold('hover'); });
  scroller.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') release('hover'); });
  scroller.addEventListener('focusin',  function () { hold('focus'); });
  scroller.addEventListener('focusout', function () { release('focus'); });
  scroller.addEventListener('touchstart', function () { hold('touch'); }, { passive: true });
  scroller.addEventListener('touchend',   function () { release('touch', RESUME); }, { passive: true });
  scroller.addEventListener('touchcancel', function () { release('touch', RESUME); }, { passive: true });

  // wheel / keyboard scrolling by the user
  function userScrolled() {
    hold('user');
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () { release('user', 0); }, RESUME);
  }
  scroller.addEventListener('wheel', userScrolled, { passive: true });
  scroller.addEventListener('keydown', function (e) {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(e.key) > -1) userScrolled();
  });

  scroller.addEventListener('scroll', wrap, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) schedule(DWELL); else { stopTimer(); cancelAnimationFrame(raf); animating = false; }
    }, { threshold: 0.3 }).observe(scroller);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stopTimer(); cancelAnimationFrame(raf); animating = false; }
    else schedule(DWELL);
  });
  reduceMotion.addEventListener && reduceMotion.addEventListener('change', function () {
    if (reduceMotion.matches) { stopTimer(); cancelAnimationFrame(raf); animating = false; }
    else schedule(DWELL);
  });

  window.addEventListener('resize', function () {
    var idx = cycle ? (scroller.scrollTop - cycle) / step : 0;
    measure();
    scroller.scrollTop = cycle + idx * step;
  });

  // --- Go -------------------------------------------------------------------
  measure();
  scroller.scrollTop = cycle;              // first original card rests under the heading
  schedule(DWELL);
})();
