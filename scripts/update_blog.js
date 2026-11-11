const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { format } = require('date-fns');
const cheerio = require('cheerio');

const RSS_URL = 'https://note.com/rokkon_uranai/rss';
const BLOG_HTML_PATH = path.join(__dirname, '../blog.html');
const BLOG_DIR = path.join(__dirname, '../blog');

// Ensure blog directory exists
if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR);
}

// Category Logic
const LOVE_KEYWORDS = ['恋愛', '結婚', '復縁', 'モテ', 'パートナー', '婚活', '夫婦', '恋人', '失恋', '不倫', '彼氏', '彼女', 'カップル', '独身', '出会い', 'マッチングアプリ'];
const WORK_KEYWORDS = ['仕事', '転職', '起業', '経営', 'キャリア', 'ビジネス', '金運', '職場', '上司', '部下', '収入', '適職', 'フリーランス', 'ギャンブル', 'スロット', 'お金'];
const FORTUNE_KEYWORDS = ['運勢', '運気', '開運', '大殺界', '空亡', '2026年', '2025年', '年運', '月運', '日運'];
const ESSAY_INDICATORS = ['思う', '考え', '感じ', 'だろうか', 'ではないか', 'かもしれない', '価値', '意味', '本当', '実は', 'なぜ', 'どうして'];

// Axios Configuration with User-Agent to avoid blocking
const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 15000 // 15 seconds timeout
};

function assignCategory(title, description, tags = []) {
    const tagsText = tags.join(' ');
    const allText = title + ' ' + description + ' ' + tagsText;

    if (LOVE_KEYWORDS.some(k => allText.includes(k))) return 'love';
    if (WORK_KEYWORDS.some(k => allText.includes(k))) return 'work';

    const hasFortuneTopic = FORTUNE_KEYWORDS.some(k => allText.includes(k));
    const hasEssayStyle = ESSAY_INDICATORS.some(k => description.includes(k));
    const isQuestionTitle = title.includes('？') || title.includes('?');
    const isAboutFortuneTelling = title.includes('占い') && (isQuestionTitle || title.includes('価値') || title.includes('好き') || title.includes('べき'));

    if (isAboutFortuneTelling) return 'life';
    if (hasFortuneTopic && !hasEssayStyle) return 'fortune';
    if (hasEssayStyle) return 'life';
    if (hasFortuneTopic) return 'fortune';

    return 'life';
}

const CAT_MAP = {
    'love': '恋愛・結婚',
    'work': '仕事・金運',
    'fortune': '占い・運勢',
    'life': 'コラム・人生'
};

async function fetchRSS() {
    try {
        const response = await axios.get(RSS_URL, axiosConfig);
        return response.data;
    } catch (error) {
        console.error('Error fetching RSS:', error.message);
        process.exit(1);
    }
}

async function parseRSS(xml) {
    const parser = new xml2js.Parser({ explicitArray: false });
    return await parser.parseStringPromise(xml);
}

// Scraping Function with retry and improved selectors
async function fetchArticleContent(url, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`  Retry ${attempt}/${retries} for: ${url}`);
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
            console.log(`Scraping: ${url}`);
            const response = await axios.get(url, axiosConfig);
            const $ = cheerio.load(response.data);

            let contentHtml = '';

            // Try multiple selectors in order of likelihood (Note's DOM structure changes frequently)
            const selectors = [
                '.note-common-styles__textnote-body',
                '.note-common-styles__text-body',
                '[data-name="body"]',
                '.p-article__content',
                'article.o-noteContentText',
                '.o-noteContentText',
                '.note-body',
                'article .note-common-styles__textnote-body'
            ];

            for (const selector of selectors) {
                if ($(selector).length) {
                    contentHtml = $(selector).html();
                    console.log(`  Found content with selector: ${selector}`);
                    break;
                }
            }

            if (!contentHtml) {
                console.warn(`  Could not extract content for ${url} (attempt ${attempt + 1})`);
                if (attempt < retries) continue;
                return null;
            }

            // Clean up:
            // Remove empty paragraphs
            contentHtml = contentHtml.replace(/<p><br><\/p>/g, '');

            // Fix images: Note often uses data-src for lazy loading
            const $content = cheerio.load(contentHtml, null, false);
            $content('img').each((i, el) => {
                const dataSrc = $content(el).attr('data-src');
                if (dataSrc) {
                    $content(el).attr('src', dataSrc);
                }
                $content(el).removeClass('lazyload');
                $content(el).css('max-width', '100%');
                $content(el).css('height', 'auto');
            });

            // Remove internal link embeds (uranai-rokkon.com)
            $content('a[href*="uranai-rokkon.com"]').each((i, el) => {
                const $widget = $content(el).closest('figure');
                if ($widget.length) {
                    $widget.remove();
                } else {
                    $content(el).closest('.external-article-widget').remove();
                }
            });

            return $content.html();

        } catch (error) {
            console.error(`  Error scraping ${url} (attempt ${attempt + 1}):`, error.message);
            if (attempt >= retries) return null;
        }
    }
    return null;
}

const SITEMAP_PATH = path.join(__dirname, '../sitemap.xml');

// ---------------------------------------------------------------------------
// テンプレート
// 記事ページ（blog/<id>.html）と一覧カード（blog.html の #blog-grid 内）の HTML。
// 見た目は css/blog.css が持つ。ここにインライン style や <style> は書かない。
// ヘッダー・フッターは他ページと同じもの（パスだけ blog/ から見た相対）。
// ---------------------------------------------------------------------------
const ASSET_VERSION = '20261111a';

const SITE_HEADER = `    <!-- ヘッダー -->
    <header class="header">
        <div class="header-inner">
            <a href="../index.html" class="logo" aria-label="占い処 六根清浄 トップページ">
                <img src="../images/logo-mark-ink.png" alt="" class="logo-mark" width="38" height="38">
                <span class="logo-text">
                    <span class="logo-sub">占い処</span>
                    <span class="logo-main">六根清浄</span>
                </span>
            </a>
            <div class="nav-wrapper" id="siteNav">
                <nav class="nav" aria-label="メインメニュー">
                    <a href="../index.html">TOP</a>
                    <a href="../beginner.html">はじめて</a>
                    <a href="../about.html">占い師</a>
                    <a href="../pricing.html">料金案内</a>
                    <a href="../testimonials.html">口コミ</a>
                    <a href="../faq.html">Q&amp;A</a>
                    <a href="../blog.html" aria-current="page">ブログ</a>
                </nav>
                <a href="../reserve.html" class="contact-btn">ご予約</a>
            </div>
            <button type="button" class="menu-toggle" onclick="toggleMenu(this);" aria-label="メニューを開く"
                aria-expanded="false" aria-controls="siteNav">
                <span></span>
                <span></span>
            </button>
        </div>
    </header>`;

const SITE_FOOTER = `    <!-- フッター -->
    <footer class="footer">
        <div class="footer-inner">
            <div class="footer-brand">
                <a href="../index.html" class="footer-logo">
                    <img src="../images/logo-mark-paper.png" alt="" width="46" height="46" loading="lazy">
                    <span class="footer-logo-text"><span class="footer-logo-sub">占い処</span>六根清浄</span>
                </a>
                <p class="footer-tagline">出会う場所。選ぶ相手。動く時期。<br>相性とタイミングを、次の一手に変える四柱推命。</p>
            </div>
            <nav class="footer-nav" aria-label="フッターメニュー">
                <p class="footer-heading">ご案内</p>
                <ul>
                    <li><a href="../index.html">TOP</a></li>
                    <li><a href="../beginner.html">はじめて</a></li>
                    <li><a href="../about.html">占い師</a></li>
                    <li><a href="../pricing.html">料金案内</a></li>
                    <li><a href="../testimonials.html">口コミ</a></li>
                    <li><a href="../faq.html">Q&amp;A</a></li>
                    <li><a href="../blog.html">ブログ</a></li>
                    <li><a href="../reserve.html">ご予約</a></li>
                    <li><a href="../stella.html">ステラファイル</a></li>
                    <li><a href="../privacy.html">プライバシー</a></li>
                </ul>
            </nav>
            <div class="footer-about">
                <p class="footer-heading">鑑定のご案内</p>
                <dl class="footer-info">
                    <div>
                        <dt>鑑定時間</dt>
                        <dd>14:00〜22:00（最終受付 21:00）</dd>
                    </div>
                    <div>
                        <dt>ご予約</dt>
                        <dd>予約フォーム24時間受付</dd>
                    </div>
                    <div>
                        <dt>場所</dt>
                        <dd>名古屋・栄（対面）／オンライン</dd>
                    </div>
                    <div>
                        <dt>お問い合わせ</dt>
                        <dd><a href="mailto:uranai.rokkon@gmail.com">uranai.rokkon@gmail.com</a></dd>
                    </div>
                </dl>
            </div>
        </div>
        <div class="footer-bottom">
            <p class="footer-operator">運営：六根清浄（個人事業・2026年5月開業／名古屋・栄）｜ステラファイルに関するお問い合わせ：stella@uranai-rokkon.com</p>
            <p class="footer-copy">© 2026 六根清浄</p>
        </div>
    </footer>

    <button type="button" id="back-to-top" class="back-to-top" aria-label="トップへ戻る">↑</button>`;

const SITE_STICKY = `    <!-- スマホ追従予約ボタン -->
    <a href="../reserve.html" class="sticky-reservation-btn">
        <span class="sticky-text">ご予約はこちら｜24時間受付</span>
    </a>`;

const FINAL_CTA = `        <!-- 最終CTA -->
        <section class="final-cta-section">
            <div class="final-cta-inner">
                <div>
                    <h2 class="final-cta-title">テーマをひとつ、<wbr>30分で整理しませんか</h2>
                    <p class="final-cta-text">
                        ご予約はフォームから24時間受付。<br>
                        空きのある日時から選ぶだけ、お申し込みは約3分です。
                    </p>
                </div>
                <div class="final-cta-action">
                    <a href="../reserve.html" class="cta-main-btn">ご予約はこちら<span
                            class="cta-main-sub">24時間受付・空き日時から選べます</span></a>
                    <p class="final-cta-sub">
                        <a href="../beginner.html" class="text-link light">はじめての方はこちら</a>
                    </p>
                </div>
            </div>
        </section>`;

// 記事ページ全体。値はすべて HTML にそのまま差し込む文字列
// （description / ogDescription は呼び出し側で &quot; エスケープ済みのもの）。
function renderArticleHTML(d) {
    return `<!DOCTYPE html>
<html lang="ja">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${d.title} | 占い処 六根清浄 ブログ</title>
    <meta name="description" content="${d.description}">
    <link rel="canonical" href="${d.canonicalUrl}">

    <!-- Structured Data -->
    <script type="application/ld+json">
    ${d.jsonLd}
    </script>

    <!-- OGP -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${d.title} | 占い処 六根清浄">
    <meta property="og:description" content="${d.ogDescription}">
    <meta property="og:url" content="${d.canonicalUrl}">
    <meta property="og:image" content="${d.thumbUrl}">

    <!-- Favicon -->
    <link rel="icon" href="../images/favicon-rokkon.png">
    <link rel="apple-touch-icon" href="../images/favicon-rokkon.png">
    <meta name="theme-color" content="#f6f3ec">

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        rel="stylesheet">

    <!-- CSS -->
    <link rel="stylesheet" href="../css/style.css?v=${ASSET_VERSION}">
    <link rel="stylesheet" href="../css/redesign.css?v=${ASSET_VERSION}">
    <link rel="stylesheet" href="../css/blog.css?v=${ASSET_VERSION}">
</head>

<body>

${SITE_HEADER}

    <!-- メインコンテンツ -->
    <main class="main-content">
        <article class="post">
            <header class="page-header post-header">
                <div class="page-header-inner">
                    <nav class="breadcrumb" aria-label="パンくずリスト">
                        <ol>
                            <li><a href="../index.html">TOP</a></li>
                            <li><a href="../blog.html">ブログ</a></li>
                            <li aria-current="page">${d.title}</li>
                        </ol>
                    </nav>
                    <h1 class="post-title">${d.title}</h1>
                </div>
            </header>

            <div class="post-layout">
                <p class="article-meta post-meta">
                    <time class="article-date" datetime="${d.isoDate}">${d.formattedDate}</time>
                    <span class="article-category">${d.displayCategory}</span>
                </p>

                <div class="post-main">
                    <img src="${d.thumbUrl}" alt="${d.title}" class="article-header-image" onerror="this.style.display='none'">

                    <div class="article-body">
                        ${d.content}
                    </div>

                    <footer class="post-footer">
                        <a href="${d.noteUrl}" target="_blank" rel="noopener" class="arrow-link original-link">この記事のNote元ページを開く</a>
                        <a href="../blog.html" class="post-back">ブログ一覧に戻る</a>
                    </footer>
                </div>
            </div>
        </article>

${FINAL_CTA}
    </main>

${SITE_FOOTER}
${SITE_STICKY}

    <script src="../js/main.js?v=${ASSET_VERSION}"></script>
</body>

</html>
`;
}

// 一覧カード 1 枚。blog.html の #blog-grid 内に並ぶ。
function renderCardHTML(c) {
    const newBadgeHtml = c.isNew ? '<span class="new-badge">NEW</span>' : '';

    return `
        <a href="blog/${c.fileName}" class="article-card" data-category="${c.category}" data-timestamp="${c.timestamp}">
            <div class="article-image">
                <img src="${c.thumbUrl}" alt="${c.title}" class="article-thumb" loading="lazy" onerror="this.src='images/otya.png'">
            </div>
            <div class="article-content">
                <p class="article-meta">
                    <time class="article-date" datetime="${c.isoDate}">${c.formattedDate}</time>
                    <span class="article-category">${c.displayCategory}</span>${newBadgeHtml}
                </p>
                <h2 class="article-title">${c.title}</h2>
                <p class="article-excerpt">${c.excerpt}</p>
            </div>
        </a>
    `;
}

function generateArticlePage(item, content, categorySlug, displayCategory, excerpt) {
    const title = item.title || "無題";
    const pubDate = new Date(item.pubDate);
    const formattedDate = format(pubDate, 'yyyy年M月d日');
    const isoDate = pubDate.toISOString();
    const noteUrl = item.link;

    // Extract ID from link
    const urlParts = noteUrl.split('/');
    const articleId = urlParts[urlParts.length - 1].split('?')[0];

    const fileName = `${articleId}.html`;
    const filePath = path.join(BLOG_DIR, fileName);
    const canonicalUrl = `https://uranai-rokkon.com/blog/${fileName}`;

    let thumbUrl = 'images/otya.png';
    if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$']['url']) {
        thumbUrl = item['media:thumbnail']['$']['url'];
    } else if (typeof item['media:thumbnail'] === 'string') {
        thumbUrl = item['media:thumbnail'];
    }

    // JSON-LD Structured Data
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "image": thumbUrl.startsWith('http') ? thumbUrl : `https://uranai-rokkon.com/${thumbUrl}`,
        "datePublished": isoDate,
        "author": {
            "@type": "Person",
            "name": "占い処 六根清浄"
        },
        "description": excerpt || title
    };

    const html = renderArticleHTML({
        title,
        description: (excerpt || title).replace(/"/g, '&quot;'),
        ogDescription: (excerpt || '六根清浄のブログ記事です。').replace(/"/g, '&quot;'),
        canonicalUrl,
        jsonLd: JSON.stringify(jsonLd),
        thumbUrl,
        isoDate,
        formattedDate,
        displayCategory,
        content,
        noteUrl
    });

    console.log(`Writing article page: ${fileName}`);
    fs.writeFileSync(filePath, html);
    return fileName;
}

function generateCardHTML(item, internalLink, manualExcerpt = null) {
    const title = item.title || "無題";
    const pubDate = new Date(item.pubDate);
    const formattedDate = format(pubDate, 'yyyy年M月d日');

    let thumbUrl = 'images/otya.png';
    if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$']['url']) {
        thumbUrl = item['media:thumbnail']['$']['url'];
    } else if (typeof item['media:thumbnail'] === 'string') {
        thumbUrl = item['media:thumbnail'];
    }

    let excerpt = '';
    const plainText = (item.description || '').replace(/<[^>]+>/g, '');

    if (manualExcerpt) {
        excerpt = manualExcerpt;
    } else {
        excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;
    }

    const assignedCategory = assignCategory(title, plainText, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
    const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

    const now = new Date();
    const diffHours = (now - pubDate) / (1000 * 60 * 60);
    const isNew = diffHours < 24;

    return renderCardHTML({
        fileName: internalLink,
        category: assignedCategory,
        displayCategory,
        timestamp: pubDate.getTime(),
        isoDate: pubDate.toISOString(),
        formattedDate,
        thumbUrl,
        title,
        excerpt,
        isNew
    });
}

async function updateSitemap(items) {
    if (!fs.existsSync(SITEMAP_PATH)) {
        console.error('Sitemap not found!');
        return;
    }

    console.log('Updating sitemap...');
    const sitemapContent = fs.readFileSync(SITEMAP_PATH, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });

    try {
        const result = await parser.parseStringPromise(sitemapContent);

        let urls = result.urlset.url;
        if (!Array.isArray(urls)) {
            urls = [urls];
        }

        let updated = false;

        for (const item of items) {
            const link = item.link;
            const urlParts = link.split('/');
            const articleId = urlParts[urlParts.length - 1].split('?')[0];
            const fileName = `${articleId}.html`;
            const fullUrl = `https://uranai-rokkon.com/blog/${fileName}`;

            // Check if exists
            const exists = urls.some(u => u.loc === fullUrl);
            if (!exists) {
                console.log(`Adding ${articleId} to sitemap`);
                urls.push({
                    loc: fullUrl,
                    lastmod: format(new Date(), 'yyyy-MM-dd'),
                    changefreq: 'monthly',
                    priority: '0.7'
                });
                updated = true;
            }
        }

        if (updated) {
            result.urlset.url = urls;
            const builder = new xml2js.Builder({
                xmldec: { version: '1.0', encoding: 'UTF-8' },
                renderOpts: { 'pretty': true, 'indent': '  ', 'newline': '\n' }
            });
            const xml = builder.buildObject(result);
            fs.writeFileSync(SITEMAP_PATH, xml);
            console.log('Sitemap updated.');
        } else {
            console.log('No new articles to add to sitemap.');
        }

    } catch (e) {
        console.error('Error updating sitemap:', e);
    }
}

async function updateBlogHTML() {
    console.log('Fetching RSS...');
    const xml = await fetchRSS();
    const result = await parseRSS(xml);

    // Convert single item to array if needed
    let items = result.rss.channel.item;
    if (!Array.isArray(items)) {
        items = [items];
    }

    console.log(`Found ${items.length} items.`);

    const cardHtmls = [];

    for (const item of items) {
        const link = item.link;

        const urlParts = link.split('/');
        const articleId = urlParts[urlParts.length - 1].split('?')[0];
        const fileName = `${articleId}.html`;
        const filePath = path.join(BLOG_DIR, fileName);

        // Wait a bit between requests to be nice
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if article page already exists (skip re-scraping for efficiency)
        const articleExists = fs.existsSync(filePath);

        let content = null;
        let excerpt = '';

        if (!articleExists) {
            // Only scrape new articles
            content = await fetchArticleContent(link);
        }

        if (content) {
            // Generate plain text excerpt from the full HTML content
            const $ = cheerio.load(content);
            const fullText = $.text().replace(/\s+/g, ' ').trim();
            excerpt = fullText.length > 60 ? fullText.substring(0, 60) + '...' : fullText;

            const plainTextDesc = (item.description || '').replace(/<[^>]+>/g, '');
            const categoryTextSource = plainTextDesc + ' ' + fullText;
            const assignedCategory = assignCategory(item.title, categoryTextSource, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
            const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

            generateArticlePage(item, content, assignedCategory, displayCategory, excerpt);
            cardHtmls.push(generateCardHTML(item, fileName, excerpt));
        } else if (articleExists) {
            // Article page exists, just generate card from RSS data
            const plainText = (item.description || '').replace(/<[^>]+>/g, '');
            excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;
            cardHtmls.push(generateCardHTML(item, fileName, excerpt));
        } else {
            // Scraping failed and no existing page - create fallback card pointing to Note
            console.warn(`Skipping article page generation for ${link} due to scrape failure`);
            const title = item.title || "無題";
            const pubDate = new Date(item.pubDate);
            const formattedDate = format(pubDate, 'yyyy年M月d日');

            let thumbUrl = 'images/otya.png';
            if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$']['url']) {
                thumbUrl = item['media:thumbnail']['$']['url'];
            } else if (typeof item['media:thumbnail'] === 'string') {
                thumbUrl = item['media:thumbnail'];
            }

            const plainText = (item.description || '').replace(/<[^>]+>/g, '');
            excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;
            const assignedCategory = assignCategory(item.title, plainText, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
            const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

            // Also generate a minimal article page with RSS description as fallback
            const fallbackContent = `<p>${plainText || '記事の取得に失敗しました。元の記事をNoteでご覧ください。'}</p>`;
            generateArticlePage(item, fallbackContent, assignedCategory, displayCategory, excerpt);
            cardHtmls.push(generateCardHTML(item, fileName, excerpt));
        }
    }

    const cardsHtmlJoined = cardHtmls.join('\n');

    console.log('Reading blog.html...');
    let html = fs.readFileSync(BLOG_HTML_PATH, 'utf8');

    // Replace only the blog-grid content using regex to avoid Cheerio HTML re-encoding issues
    const gridRegex = /(<div id="blog-grid"[^>]*>)([\s\S]*?)(<\/div>\s*\n?\s*\n?\s*(?:<\!-- Load More|\s*<\/div>))/;
    const match = html.match(gridRegex);

    if (match) {
        // Find the exact blog-grid div and replace its contents
        const blogGridStart = html.indexOf('<div id="blog-grid"');
        if (blogGridStart !== -1) {
            // Find the opening tag end
            const openTagEnd = html.indexOf('>', blogGridStart) + 1;
            // Find the closing </div> for blog-grid
            // We need to count nested divs
            let depth = 1;
            let pos = openTagEnd;
            while (depth > 0 && pos < html.length) {
                const nextOpen = html.indexOf('<div', pos);
                const nextClose = html.indexOf('</div>', pos);

                if (nextClose === -1) break;

                if (nextOpen !== -1 && nextOpen < nextClose) {
                    depth++;
                    pos = nextOpen + 4;
                } else {
                    depth--;
                    if (depth === 0) {
                        // Replace content between openTagEnd and nextClose
                        html = html.substring(0, openTagEnd) + '\n' + cardsHtmlJoined + '\n' + html.substring(nextClose);
                        break;
                    }
                    pos = nextClose + 6;
                }
            }
        }

        // Remove loading indicator if present
        html = html.replace(/<p[^>]*>[\s\S]*?記事を読み込んでいます[\s\S]*?<\/p>/g, '');
        html = html.replace(/<div[^>]*id="loading-indicator"[^>]*>[\s\S]*?<\/div>/g, '');

        console.log('Writing updated blog.html...');
        fs.writeFileSync(BLOG_HTML_PATH, html);
        console.log('Done!');
    } else {
        console.error('Could not find #blog-grid in blog.html');
    }

    // Update Sitemap
    await updateSitemap(items);
}

// テンプレートの確認用に関数を公開する（require しただけでは何も実行しない）。
// `node scripts/update_blog.js` として直接実行されたときだけ更新処理を走らせる。
module.exports = { renderArticleHTML, renderCardHTML, generateArticlePage, generateCardHTML, assignCategory, CAT_MAP };

if (require.main === module) {
    updateBlogHTML();
}
