/**
 * ブログ一覧：カテゴリ絞り込みと「もっと見る」
 * カード（.article-card）はビルド時に #blog-grid へ全件出力済み。
 * ここでは hidden 属性の付け外しだけで出し分ける（見た目は css/blog.css が持つ）。
 */
document.addEventListener('DOMContentLoaded', () => {
    const BLOG_GRID = document.getElementById('blog-grid');
    const LOADING_INDICATOR = document.getElementById('loading-indicator');
    const PAGINATION_CONTAINER = document.getElementById('pagination-container');
    const LOAD_MORE_BTN = document.getElementById('load-more-btn');
    const EMPTY_MESSAGE = document.getElementById('blog-empty');
    const FILTER_BTNS = document.querySelectorAll('.filter-btn');

    if (!BLOG_GRID) return;

    // 1回に表示する件数
    const ITEMS_PER_PAGE = 9;

    let allItems = [];
    let filteredItems = [];
    let displayedCount = 0;

    function hydrate() {
        if (LOADING_INDICATOR) LOADING_INDICATOR.hidden = true;
        allItems = Array.from(BLOG_GRID.querySelectorAll('.article-card'));
        applyFilter('all');
    }

    FILTER_BTNS.forEach(btn => {
        btn.addEventListener('click', () => {
            FILTER_BTNS.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            applyFilter(btn.getAttribute('data-filter'));
        });
    });

    function applyFilter(filterType) {
        displayedCount = 0;

        filteredItems = filterType === 'all'
            ? allItems
            : allItems.filter(card => card.getAttribute('data-category') === filterType);

        allItems.forEach(card => {
            card.hidden = true;
            card.style.display = '';
        });

        showMoreItems();
        updatePagination();
    }

    if (LOAD_MORE_BTN) {
        LOAD_MORE_BTN.addEventListener('click', () => {
            showMoreItems();
            updatePagination();
        });
    }

    function showMoreItems() {
        const nextBatch = filteredItems.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);
        nextBatch.forEach(card => {
            card.hidden = false;
        });
        displayedCount += nextBatch.length;
    }

    function updatePagination() {
        if (PAGINATION_CONTAINER) {
            PAGINATION_CONTAINER.hidden = displayedCount >= filteredItems.length;
        }
        if (EMPTY_MESSAGE) {
            EMPTY_MESSAGE.hidden = filteredItems.length > 0;
        }
    }

    hydrate();
});
