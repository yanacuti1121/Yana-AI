/**
 * YANA DESIGN SCRIPT LAYER 2026 (site26.js)
 * Tương tác nhạy, đàn hồi, vệt sáng theo con trỏ, video tự dừng/phát thông minh và tilt 3D iMac.
 */

(function () {
  'use strict';

  // 1. Tối ưu hoá tương tác di chuột (Glow follow + 3D Tilt) bằng requestAnimationFrame
  const cards = document.querySelectorAll('.has-glow-2026, .card-3d-interactive');
  cards.forEach(card => {
    let ticking = false;
    card.addEventListener('mousemove', e => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          card.style.setProperty('--mouse-x', `${x}px`);
          card.style.setProperty('--mouse-y', `${y}px`);
          
          // Tính góc nghiêng 3D tinh tế (tối đa ±4 độ)
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const tiltY = ((x - centerX) / centerX) * 4;
          const tiltX = -((y - centerY) / centerY) * 4;
          card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
          card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
          
          ticking = false;
        });
        ticking = true;
      }
    });

    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  });

  // Hỗ trợ nút sao chép mã lệnh một chạm
  document.querySelectorAll('[data-copy-text]').forEach(btn => {
    btn.addEventListener('click', () => {
      const textToCopy = btn.getAttribute('data-copy-text');
      if (navigator.clipboard && textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          const origText = btn.textContent;
          btn.textContent = { vi: 'Đã chép! ✓', ko: '복사됨! ✓' }[document.documentElement.lang.slice(0, 2)] || 'Copied! ✓';
          btn.style.color = '#10b981';
          setTimeout(() => {
            btn.textContent = origText;
            btn.style.color = '';
          }, 2000);
        });
      }
    });
  });


  // 2. Nghiêng 3D nhẹ khi cuộn tới màn hình iMac / MacBook (tiết kiệm GPU với IntersectionObserver)
  const tiltElements = document.querySelectorAll('[data-tilt-on-scroll]');
  if ('IntersectionObserver' in window && tiltElements.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const ratio = entry.intersectionRatio;
          const target = entry.target;
          const rotateX = (1 - ratio) * 10;
          const translateY = (1 - ratio) * 20;
          target.style.transform = `rotateX(${rotateX.toFixed(2)}deg) translateY(${translateY.toFixed(2)}px)`;
        }
      });
    }, {
      threshold: Array.from({ length: 21 }, (_, i) => i * 0.05)
    });

    tiltElements.forEach(el => observer.observe(el));
  }

  // 3. Tab chuyển đổi không gian Studio + Điều khiển Video thông minh (dừng video ẩn để mát GPU)
  const tabButtons = document.querySelectorAll('[data-studio-tab]');
  const tabPanels = document.querySelectorAll('[data-studio-panel], .studio-tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabTarget = btn.getAttribute('data-studio-tab');
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => {
        p.classList.remove('active');
        const vid = p.querySelector('video');
        if (vid) vid.pause();
      });

      btn.classList.add('active');
      const targetPanel = document.getElementById(tabTarget);
      if (targetPanel) {
        targetPanel.classList.add('active');
        const activeVid = targetPanel.querySelector('video');
        if (activeVid) {
          activeVid.play().catch(() => {});
        }
      }
    });
  });

  // 4. Tự dừng video khi màn hình khuất khỏi tầm nhìn (Mục 5 & 8 của quy tắc hiệu năng)
  const allVideos = document.querySelectorAll('.imac-screen-inner video');
  if ('IntersectionObserver' in window && allVideos.length > 0) {
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const vid = entry.target;
        if (!entry.isIntersecting) {
          vid.pause();
        } else {
          // Chỉ phát lại nếu đang ở tab active
          const parentPanel = vid.closest('.studio-tab-panel');
          if (parentPanel && parentPanel.classList.contains('active')) {
            vid.play().catch(() => {});
          }
        }
      });
    }, { threshold: 0.1 });

    allVideos.forEach(v => videoObserver.observe(v));
  }

  console.log('✨ [Yana 2026] Studio & Site26 Layer initialized smoothly (GPU optimal, smart video control).');
})();

  // 5. Hiệu ứng Cuộn Trượt Ngang (Horizontal Scroll) khi cuộn dọc trang
  const horizSection = document.querySelector('.studio-horizontal-section');
  const horizTrack = document.querySelector('.studio-horizontal-track');

  if (horizSection && horizTrack) {
    let tickingHoriz = false;
    window.addEventListener('scroll', () => {
      if (!tickingHoriz) {
        window.requestAnimationFrame(() => {
          const rect = horizSection.getBoundingClientRect();
          const windowH = window.innerHeight;
          // Tính tỷ lệ cuộn bên trong section
          const totalScroll = rect.height - windowH;
          const currentScroll = -rect.top;
          
          if (currentScroll >= 0 && currentScroll <= totalScroll) {
            const progress = currentScroll / totalScroll;
            const maxTranslate = horizTrack.scrollWidth - window.innerWidth + 120;
            if (maxTranslate > 0) {
              horizTrack.style.transform = `translateX(-${progress * maxTranslate}px)`;
            }
          }
          tickingHoriz = false;
        });
        tickingHoriz = true;
      }
    }, { passive: true });
  }
