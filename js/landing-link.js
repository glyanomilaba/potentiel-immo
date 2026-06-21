// Potentiel Immo — interactions de la page landing.html ("en savoir plus")
// Cette page n'embarque plus le chatbot : tous les CTA renvoient vers
// l'accueil conversationnel (index.html), désormais le vrai point d'entrée.

document.addEventListener('DOMContentLoaded', () => {

  // Animation du chiffre "potentiel estimé" dans la carte hero
  const figure = document.getElementById('heroFigure');
  const bar = document.getElementById('heroBar');

  if (figure && bar) {
    const target = 290; // delta entre loyer actuel (1050) et potentiel (1340)
    const duration = 1400;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const value = Math.round(eased * target);
      figure.textContent = '+' + value.toLocaleString('fr-FR');
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          requestAnimationFrame(tick);
          bar.style.width = '78%';
          observer.disconnect();
        }
      });
    }, { threshold: 0.4 });

    observer.observe(figure);
  }

  // Animations de révélation au scroll (sections + éléments en cascade)
  const revealTargets = document.querySelectorAll('[data-reveal], [data-reveal-item]');
  if (revealTargets.length && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    revealTargets.forEach(el => revealObserver.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }

  // Légère parallaxe sur la carte du hero au scroll
  const heroCard = document.querySelector('.potential-card');
  if (heroCard && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const offset = window.scrollY;
          if (offset < 700) {
            heroCard.style.transform = `translateY(${offset * 0.08}px)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // Tous les CTA de la landing renvoient vers l'accueil conversationnel
  document.querySelectorAll('[data-cta]').forEach(el => {
    el.setAttribute('href', 'index.html');
  });

});
