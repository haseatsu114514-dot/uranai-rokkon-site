// FAQアコーディオン
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.question').forEach(function (q) {
        q.addEventListener('click', function () {
            var item = q.closest('.faq-item');
            if (!item) return;
            var open = item.classList.toggle('faq-open');
            q.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    });
});
