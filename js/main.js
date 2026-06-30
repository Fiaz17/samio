/* ===== Firebase & Firestore Setup ===== */
const db = firebase.firestore();

// Fallback settings used if Firestore has no settings doc yet
const defaultSettings = {
    whatsappNumber: '8801625627131',
    seoTitle: 'Samio Enterprise | Premium Corporate Gifts & Crest Awards Supplier BD',
    seoDescription: 'Samio Enterprise is the leading corporate gift, crest awards, and personalized printing supplier in Bangladesh.',
    seoKeywords: 'Corporate gift Bangladesh, Custom printed mug BD, Crest award supplier, Promotional items Bangladesh, Executive gifts Dhaka'
};

// In-memory data (populated from Firestore on load)
let categories = [];
let products   = [];
let banners    = [];
let portfolio  = [];
let settings   = { ...defaultSettings };

// Tracks the hero Swiper instance so we can destroy/recreate it safely
let heroSwiperInstance = null;

/* ===== Banner Cache (localStorage) ===== */
// Cache banner URLs locally so the hero renders instantly on repeat visits
const BANNER_CACHE_KEY = 'samio_banners_v1';
const BANNER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getBannerCache() {
    try {
        const raw = localStorage.getItem(BANNER_CACHE_KEY);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        return (Date.now() - ts < BANNER_CACHE_TTL) ? data : null;
    } catch { return null; }
}

function saveBannerCache(data) {
    try {
        localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch {}
}

// Inject <link rel="preload"> tags for banner images so the browser fetches
// them as early as possible, before the CSS would normally trigger the download
function preloadBannerImages(list) {
    list.filter(b => b.active && b.image).forEach((b, i) => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = b.image;
        if (i === 0) link.setAttribute('fetchpriority', 'high');
        document.head.appendChild(link);
    });
}

/* ===== Firestore Data Loader ===== */
// Load everything from Firestore in parallel
async function dbInit() {
    try {
        const [catsSnap, prodsSnap, bannersSnap, portSnap, settingsDoc] = await Promise.all([
            db.collection('categories').get(),
            db.collection('products').get(),
            db.collection('banners').get(),
            db.collection('portfolio').get(),
            db.doc('settings/main').get()
        ]);

        categories = catsSnap.docs.map(d => d.data());
        products   = prodsSnap.docs.map(d => d.data());
        banners    = bannersSnap.docs.map(d => d.data());
        portfolio  = portSnap.docs.map(d => d.data());
        settings   = settingsDoc.exists ? settingsDoc.data() : { ...defaultSettings };

        document.title = settings.seoTitle || 'Samio Enterprise';
        document.getElementById('meta-description').setAttribute('content', settings.seoDescription || '');
        document.getElementById('meta-keywords').setAttribute('content', settings.seoKeywords || '');
        const phone = settings.whatsappNumber || '';
        document.getElementById('footer-phone-display').textContent =
            phone.startsWith('880') ? '+' + phone.replace(/(\d{5})(\d{6})/, '$1-$2') : phone;
    } catch (err) {
        console.error('Firestore load error:', err);
    }
}

/* ===== DOM Element Cache ===== */
const storefrontContent        = document.getElementById('storefront-content');
const categoryProductsViewPage = document.getElementById('category-products-view-page');
const searchBarModal           = document.getElementById('search-bar-modal');
const searchInputField         = document.getElementById('search-input-field');
const searchSuggestionsDropdown = document.getElementById('search-suggestions-dropdown');
const productDetailModal       = document.getElementById('product-detail-modal');
const loadingOverlay           = document.getElementById('page-loading-overlay');

/* ===== Main Entry Point ===== */
window.addEventListener('DOMContentLoaded', async () => {
    // Phase 1 — instant hero from cache (no Firestore wait)
    const cachedBanners = getBannerCache();
    if (cachedBanners && cachedBanners.length > 0) {
        banners = cachedBanners;
        preloadBannerImages(banners);
        renderHeroSlideshow();
        heroSwiperInstance = initHeroSwiper();
        loadingOverlay.style.display = 'none';
    } else {
        loadingOverlay.style.display = 'flex';
    }

    // Phase 2 — fetch all Firestore data, then render full page
    await dbInit();
    saveBannerCache(banners);
    preloadBannerImages(banners);

    renderHeaderStyles();
    renderHeroSlideshow();
    renderCatalogueCategories();
    renderFeaturedProducts();
    renderMasonryPortfolio();
    renderFooterCategories();
    setupInquiryLinks();
    initSwiperComponents();
    setupMobileMenu();
    setupScrollToTop();

    loadingOverlay.style.display = 'none';

    document.getElementById('close-category-page-btn').addEventListener('click', () => {
        history.pushState(null, '', window.location.pathname);
        categoryProductsViewPage.style.display = 'none';
        storefrontContent.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    handleRouting();
    window.addEventListener('hashchange', handleRouting);
});

/* ===== Header Scroll Transition ===== */
// Elegant header scroll transition
window.addEventListener('scroll', () => {
    const header = document.getElementById('site-header');
    if (window.scrollY > 40) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

/* ===== Navigation Anchors ===== */
// Header Navigation Anchor jump/routing helper
document.querySelectorAll('.nav-anchor').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = anchor.getAttribute('data-target');

        // Route to storefront first if on dynamic page
        if (categoryProductsViewPage.style.display === 'block') {
            window.location.hash = '';
            setTimeout(() => scrollToAnchor(target), 300);
        } else {
            scrollToAnchor(target);
        }
    });
});

function scrollToAnchor(targetId) {
    const element = document.getElementById(targetId);
    if (element) {
        const headerOffset = 85;
        const elementPosition = element.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = elementPosition - headerOffset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }
}

/* ===== Router ===== */
function handleRouting() {
    const hash = window.location.hash;
    if (hash.startsWith('#category/')) {
        const catId = parseInt(hash.split('/')[1]);
        const categoryObj = categories.find(c => c.id === catId);
        if (categoryObj) {
            showCategorySpecificPage(categoryObj);
        } else {
            showStorefrontHome();
        }
    } else {
        showStorefrontHome();
    }
}

function showStorefrontHome() {
    categoryProductsViewPage.style.display = 'none';
    storefrontContent.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===== Hero Slideshow ===== */
// Render storefront slides
function renderHeroSlideshow() {
    const sliderWrapper = document.getElementById('hero-slider-wrapper');
    sliderWrapper.innerHTML = '';

    const activeBanners = banners.filter(b => b.active);
    if (activeBanners.length === 0) {
        sliderWrapper.innerHTML = `
            <div class="swiper-slide hero-slide">
                <img src="https://picsum.photos/seed/samiobg/1920/600.jpg"
                     class="hero-bg-img" alt="Banner" loading="eager" fetchpriority="high">
            </div>
        `;
        return;
    }

    activeBanners.forEach((slide, i) => {
        const slideDiv = document.createElement('div');
        slideDiv.className = 'swiper-slide hero-slide';
        // First slide gets high fetch priority so it appears before the fold paints
        slideDiv.innerHTML = `<img src="${slide.image}" class="hero-bg-img" alt="Banner"
            loading="eager" fetchpriority="${i === 0 ? 'high' : 'auto'}">`;
        sliderWrapper.appendChild(slideDiv);
    });
}

/* ===== Categories Rendering ===== */
// Render circular/grid based categories
function renderCatalogueCategories() {
    const catGrid = document.getElementById('catalogue-categories-grid');
    catGrid.innerHTML = '';

    categories.forEach(cat => {
        const count = products.filter(p => p.categoryId === cat.id).length;
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
            <div class="category-img-wrapper">
                <img src="${cat.coverImage}" alt="${cat.name}" class="category-img" loading="lazy">
                <div class="category-overlay">
                    <span class="category-count">${count} Items</span>
                </div>
            </div>
            <div class="category-info">
                <h3 class="category-name">${cat.name}</h3>
                <p class="product-desc" style="margin-bottom:0; font-size:0.85rem;">${cat.description || 'Custom corporate gift series'}</p>
            </div>
        `;
        card.addEventListener('click', () => {
            window.location.hash = `category/${cat.id}`;
        });
        catGrid.appendChild(card);
    });
}

/* ===== Featured Products Rendering ===== */
// Render featured products on home grid
function renderFeaturedProducts() {
    const featuredGrid = document.getElementById('featured-products-grid');
    featuredGrid.innerHTML = '';

    const featuredItems = products.filter(p => p.featured);
    if (featuredItems.length === 0) {
        featuredGrid.innerHTML = '<p class="search-empty" style="grid-column:1/-1;">No products featured currently.</p>';
        return;
    }

    featuredItems.forEach(product => {
        const catObj = categories.find(c => c.id === product.categoryId);
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <span class="featured-badge">Featured</span>
            <div class="product-img-wrapper" onclick="openProductDetailModal(${product.id})">
                <img src="${product.images && product.images[0] ? product.images[0] : 'https://picsum.photos/seed/none/400/300.jpg'}" alt="${product.name}" class="product-img" loading="lazy">
            </div>
            <div class="product-info">
                <span class="product-category-tag">${catObj ? catObj.name : 'Corporate Souvenir'}</span>
                <h3 class="product-title" onclick="openProductDetailModal(${product.id})">${product.name}</h3>
                <p class="product-desc">${product.description.substring(0, 100)}...</p>
                <div class="product-actions">
                    <button class="btn-view-details" onclick="openProductDetailModal(${product.id})">View Details</button>
                    <a href="${generateWhatsAppLink(product.name)}" target="_blank" class="btn-whatsapp-inquire" title="Quick WhatsApp Inquiry">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </div>
        `;
        featuredGrid.appendChild(card);
    });
}

/* ===== Masonry Portfolio ===== */
// Render Masonry Recent Portfolio
function renderMasonryPortfolio() {
    const filters = document.getElementById('portfolio-category-filters');
    const gallery = document.getElementById('portfolio-gallery-masonry');

    filters.innerHTML = '';
    gallery.innerHTML = '';

    // Unique categories in portfolio
    const uniqueTags = ['All', ...new Set(portfolio.map(p => p.tag))];

    uniqueTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = `portfolio-filter-btn ${tag === 'All' ? 'active' : ''}`;
        btn.textContent = tag;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.portfolio-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterPortfolioGallery(tag);
        });
        filters.appendChild(btn);
    });

    // Initial load of gallery
    filterPortfolioGallery('All');
}

function filterPortfolioGallery(selectedTag) {
    const gallery = document.getElementById('portfolio-gallery-masonry');
    gallery.innerHTML = '';

    const filteredItems = selectedTag === 'All' ? portfolio : portfolio.filter(p => p.tag === selectedTag);

    if (filteredItems.length === 0) {
        gallery.innerHTML = '<p class="search-empty">No portfolio work added yet under this tag.</p>';
        return;
    }

    filteredItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'portfolio-item';
        div.innerHTML = `
            <img src="${item.image}" alt="${item.title}" class="portfolio-item-img" loading="lazy">
            <div class="portfolio-item-overlay">
                <span class="portfolio-item-client">${item.clientName}</span>
                <h4 class="portfolio-item-title">${item.title}</h4>
            </div>
        `;
        // Clicking portfolio image opens dynamic quick enquiry modal
        div.addEventListener('click', () => {
            openQuickInquiryModal(item);
        });
        gallery.appendChild(div);
    });
}

function openQuickInquiryModal(portfolioItem) {
    // Treat portfolio item inquiry elegantly by directing directly to WhatsApp
    const message = `Hello Samio Enterprise, I was browsing your Portfolio works. I want to inquire about: [${portfolioItem.title}] branded for [${portfolioItem.clientName}]. Please provide customization details.`;
    const waUrl = `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
}

/* ===== Footer ===== */
// Populate dynamic category list in footer
function renderFooterCategories() {
    const footerList = document.getElementById('footer-categories-list');
    footerList.innerHTML = '';

    categories.slice(0, 5).forEach(cat => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="#category/${cat.id}">${cat.name}</a>`;
        footerList.appendChild(li);
    });
}

/* ===== WhatsApp Links ===== */
// WhatsApp dynamic link generator
function generateWhatsAppLink(productName) {
    const message = `Hello Samio Enterprise, I am interested in inquiring about this product: [${productName}]. Please provide details and pricing quotes.`;
    return `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function setupInquiryLinks() {
    const floatingBtn = document.getElementById('floating-whatsapp-widget-btn');
    floatingBtn.href = `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent("Hello Samio Enterprise, I want to know more about your premium corporate packages and customized gift supplies.")}`;
}

/* ===== Category Products Page ===== */
// Dynamic categories products router page
function showCategorySpecificPage(category) {
    storefrontContent.style.display = 'none';
    categoryProductsViewPage.style.display = 'block';

    document.getElementById('page-header-title').textContent = category.name;
    document.getElementById('page-header-desc').textContent = category.description || 'Exquisite collections designed to align with your corporate stature.';

    renderCategorySpecificProducts(category.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCategorySpecificProducts(categoryId) {
    const grid = document.getElementById('category-specific-products-grid');
    grid.innerHTML = '';

    let catProducts = products.filter(p => p.categoryId === categoryId);
    document.getElementById('category-products-count-label').textContent = `Showing ${catProducts.length} customizable corporate items`;

    if (catProducts.length === 0) {
        grid.innerHTML = '<p class="search-empty" style="grid-column: 1/-1;">No products found in this category yet. Check back soon or query custom designs.</p>';
        return;
    }

    // Handle Sorting
    const sortingSelect = document.getElementById('product-sorting-select');
    sortingSelect.onchange = () => {
        const val = sortingSelect.value;
        if (val === 'name-asc') {
            catProducts.sort((a,b) => a.name.localeCompare(b.name));
        } else if (val === 'name-desc') {
            catProducts.sort((a,b) => b.name.localeCompare(a.name));
        } else {
            catProducts = products.filter(p => p.categoryId === categoryId); // default
        }
        renderFilteredProductsList(catProducts, grid);
    };

    renderFilteredProductsList(catProducts, grid);
}

function renderFilteredProductsList(productList, targetGrid) {
    targetGrid.innerHTML = '';
    productList.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            ${product.featured ? '<span class="featured-badge">Featured</span>' : ''}
            <div class="product-img-wrapper" onclick="openProductDetailModal(${product.id})">
                <img src="${product.images && product.images[0] ? product.images[0] : 'https://picsum.photos/seed/none/400/300.jpg'}" alt="${product.name}" class="product-img" loading="lazy">
            </div>
            <div class="product-info">
                <span class="product-category-tag">Premium Stock</span>
                <h3 class="product-title" onclick="openProductDetailModal(${product.id})">${product.name}</h3>
                <p class="product-desc">${product.description.substring(0, 100)}...</p>
                <div class="product-actions">
                    <button class="btn-view-details" onclick="openProductDetailModal(${product.id})">View Details</button>
                    <a href="${generateWhatsAppLink(product.name)}" target="_blank" class="btn-whatsapp-inquire" title="Quick WhatsApp Inquiry">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </div>
        `;
        targetGrid.appendChild(card);
    });
}

/* ===== Search Engine (Fuse.js) ===== */
// Smart Autocomplete Fuzzy Search (Fuse.js Integrator)
let fuseInstance = null;
function initSearchEngine() {
    if (products.length === 0) return;

    const options = {
        keys: ['name', 'description', 'tags'],
        threshold: 0.4, // Perfect balance for fuzzy spelling typo tolerances (Fuse.js default 0.6)
        includeMatches: true
    };

    // Enhance products data with Category Name for complete coverage
    const formattedSearchData = products.map(p => {
        const categoryObj = categories.find(c => c.id === p.categoryId);
        return {
            ...p,
            categoryName: categoryObj ? categoryObj.name : ''
        };
    });
    options.keys.push('categoryName');

    fuseInstance = new Fuse(formattedSearchData, options);
}

// Fuzzy match input trigger
document.getElementById('search-widget-trigger').addEventListener('click', () => {
    searchBarModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        searchInputField.focus();
        initSearchEngine();
    }, 100);
});

document.getElementById('search-close-button').addEventListener('click', closeSearchModal);

searchBarModal.addEventListener('click', (e) => {
    if (e.target === searchBarModal) closeSearchModal();
});

function closeSearchModal() {
    searchBarModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    searchInputField.value = '';
    searchSuggestionsDropdown.innerHTML = '';
}

searchInputField.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    searchSuggestionsDropdown.innerHTML = '';

    if (!query) {
        // Pre-populate elegant popular suggestions
        searchSuggestionsDropdown.innerHTML = `
            <div class="suggestion-group-title">Popular Gifting Searches</div>
            <a class="search-item" onclick="simulateSearch('crest')">
                <div class="search-item-info">
                    <span class="search-item-name"><i class="fa fa-star" style="color:var(--gold-primary); margin-right:8px;"></i> Commemorative Awards & Crests</span>
                </div>
            </a>
            <a class="search-item" onclick="simulateSearch('mug')">
                <div class="search-item-info">
                    <span class="search-item-name"><i class="fa fa-coffee" style="color:var(--gold-primary); margin-right:8px;"></i> Printed Logo Mugs Collection</span>
                </div>
            </a>
            <a class="search-item" onclick="simulateSearch('diary')">
                <div class="search-item-info">
                    <span class="search-item-name"><i class="fa fa-book" style="color:var(--gold-primary); margin-right:8px;"></i> Customized Corporate Diaries</span>
                </div>
            </a>
        `;
        return;
    }

    if (!fuseInstance) initSearchEngine();
    if (!fuseInstance) return;

    const results = fuseInstance.search(query).slice(0, 5); // top 5 recommendations

    if (results.length === 0) {
        searchSuggestionsDropdown.innerHTML = '<p class="search-empty">No corporate products found matching your search. Try custom specs!</p>';
        return;
    }

    searchSuggestionsDropdown.innerHTML = `<div class="suggestion-group-title">Matching Results (${results.length})</div>`;
    results.forEach(result => {
        const item = result.item;
        const link = document.createElement('a');
        link.className = 'search-item';
        link.innerHTML = `
            <img src="${item.images[0]}" alt="${item.name}" class="search-item-img">
            <div class="search-item-info">
                <span class="search-item-name">${item.name}</span>
                <span class="search-item-cat">${item.categoryName || 'Product'}</span>
            </div>
        `;
        link.addEventListener('click', () => {
            closeSearchModal();
            openProductDetailModal(item.id);
        });
        searchSuggestionsDropdown.appendChild(link);
    });
});

function simulateSearch(term) {
    searchInputField.value = term;
    searchInputField.dispatchEvent(new Event('input'));
}

/* ===== Product Detail Modal ===== */
// High-end Product Detail Modal Manager
function openProductDetailModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const catObj = categories.find(c => c.id === product.categoryId);

    // Populate text content
    document.getElementById('detail-modal-category').textContent = catObj ? catObj.name : 'PREMIUM SOUVENIR';
    document.getElementById('detail-modal-title').textContent = product.name;
    document.getElementById('detail-modal-desc').textContent = product.description;

    // Set main image & image index
    const mainImg = document.getElementById('detail-modal-main-img');
    mainImg.src = product.images[0] || 'https://picsum.photos/seed/none/400/300.jpg';
    mainImg.alt = product.name;

    // Handle hover Magnifier effect
    const zoomFrame = document.getElementById('main-image-zoom-frame');
    zoomFrame.onmousemove = (e) => {
        const x = e.clientX - zoomFrame.offsetLeft;
        const y = e.clientY - zoomFrame.offsetTop;
        const mWidth = zoomFrame.offsetWidth;
        const mHeight = zoomFrame.offsetHeight;

        const percentX = (x / mWidth) * 100;
        const percentY = (y / mHeight) * 100;

        mainImg.style.transformOrigin = `${percentX}% ${percentY}%`;
        mainImg.style.transform = 'scale(1.8)';
    };

    zoomFrame.onmouseleave = () => {
        mainImg.style.transform = 'scale(1)';
        mainImg.style.transformOrigin = 'center';
    };

    // Populate image strip thumbnails
    const strip = document.getElementById('detail-modal-thumbnails-strip');
    strip.innerHTML = '';

    const allImages = product.images || [product.images[0]];
    allImages.forEach((imgUrl, idx) => {
        const thumb = document.createElement('img');
        thumb.className = `modal-thumb ${idx === 0 ? 'active' : ''}`;
        thumb.src = imgUrl;
        thumb.alt = `${product.name} Angle ${idx + 1}`;
        thumb.addEventListener('click', () => {
            document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            mainImg.src = imgUrl;
        });
        strip.appendChild(thumb);
    });

    // Populate tags
    const tagsList = document.getElementById('detail-modal-tags-list');
    tagsList.innerHTML = '';

    const productTags = product.tags || ['custom logo', 'bulk delivery', 'corporate branding'];
    productTags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'modal-tag';
        tagSpan.textContent = `#${tag.trim()}`;
        tagsList.appendChild(tagSpan);
    });

    // Setup WhatsApp button
    document.getElementById('detail-modal-whatsapp-btn').href = generateWhatsAppLink(product.name);

    // Render Related Products
    renderRelatedProducts(product);

    // Open Modal
    productDetailModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Close Product modal
document.getElementById('close-product-modal-btn').addEventListener('click', closeProductModalDetails);
productDetailModal.addEventListener('click', (e) => {
    if (e.target === productDetailModal) closeProductModalDetails();
});

function closeProductModalDetails() {
    productDetailModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

/* ===== Related Products ===== */
// Render Related Products bottom carousel in Modal
function renderRelatedProducts(activeProduct) {
    const grid = document.getElementById('detail-modal-related-grid');
    grid.innerHTML = '';

    const related = products
        .filter(p => p.categoryId === activeProduct.categoryId && p.id !== activeProduct.id)
        .slice(0, 4); // Limit to top 4 related products

    if (related.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:0.85rem; font-style:italic;">No other related items in this category.</p>';
        return;
    }

    related.forEach(product => {
        const card = document.createElement('div');
        card.className = 'related-product-card';
        card.innerHTML = `
            <img src="${product.images[0]}" alt="${product.name}" class="related-product-img">
            <div class="related-product-info">
                <h4 class="related-product-title">${product.name}</h4>
            </div>
        `;
        card.addEventListener('click', () => {
            openProductDetailModal(product.id);
        });
        grid.appendChild(card);
    });
}

/* ===== Swiper Components ===== */
// Initialize Swipers after loaders finish
// Destroy any existing hero Swiper, then create a fresh one
function initHeroSwiper() {
    if (heroSwiperInstance) {
        heroSwiperInstance.destroy(true, true);
        heroSwiperInstance = null;
    }
    heroSwiperInstance = new Swiper('.hero-swiper', {
        loop: true,
        autoplay: { delay: 4500, disableOnInteraction: false },
        pagination: { el: '.swiper-pagination', clickable: true },
        navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
        effect: 'fade',
        fadeEffect: { crossFade: true }
    });
    return heroSwiperInstance;
}

function initSwiperComponents() {
    initHeroSwiper();

    // Swiper Testimonials
    new Swiper('.testimonials-swiper', {
        loop: true,
        autoplay: {
            delay: 5000,
            disableOnInteraction: true,
        },
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
        spaceBetween: 30
    });
}

/* ===== Header Styles ===== */
function renderHeaderStyles() {
    // Injects responsive gold lines to custom pages
}

/* ===== Mobile Menu ===== */
function setupMobileMenu() {
    const hamburger = document.getElementById('hamburger-toggle');
    const drawer = document.getElementById('mobile-nav-drawer');
    const overlay = document.getElementById('mobile-nav-overlay');
    const closeBtn = document.getElementById('mobile-nav-close-btn');
    const mobileNavSearchBtn = document.getElementById('mobile-nav-search-btn');
    const mobileWhatsappCta = document.getElementById('mobile-whatsapp-cta');
    const mobileSearchIcon = document.getElementById('mobile-search-icon');

    function openMenu() {
        drawer.classList.add('active');
        overlay.classList.add('active');
        hamburger.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
        drawer.classList.remove('active');
        overlay.classList.remove('active');
        hamburger.classList.remove('active');
        if (!searchBarModal.style.display || searchBarModal.style.display === 'none') {
            document.body.style.overflow = '';
        }
    }

    hamburger.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);

    // Handle mobile nav item anchor clicks
    drawer.querySelectorAll('.mobile-nav-item[data-target]').forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            closeMenu();
            if (categoryProductsViewPage.style.display === 'block') {
                window.location.hash = '';
                setTimeout(() => scrollToAnchor(target), 380);
            } else {
                setTimeout(() => scrollToAnchor(target), 380);
            }
        });
    });

    // Mobile search button inside drawer
    mobileNavSearchBtn.addEventListener('click', () => {
        closeMenu();
        setTimeout(() => {
            searchBarModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                searchInputField.focus();
                initSearchEngine();
            }, 100);
        }, 320);
    });

    // Mobile search icon in header bar
    mobileSearchIcon.addEventListener('click', () => {
        searchBarModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            searchInputField.focus();
            initSearchEngine();
        }, 100);
    });

    // Sync mobile WhatsApp CTA with settings
    if (settings.whatsappNumber) {
        const msg = encodeURIComponent("Hello Samio Enterprise, I want to know more about your premium corporate packages and customized gift supplies.");
        mobileWhatsappCta.href = `https://wa.me/${settings.whatsappNumber}?text=${msg}`;
    }

    // Close menu if logo is tapped on mobile
    document.getElementById('home-logo-link').addEventListener('click', () => {
        if (drawer.classList.contains('active')) closeMenu();
    });

    // Populate categories list from data
    const categoriesSubmenu = document.getElementById('mobile-categories-submenu');
    categories.forEach(cat => {
        const item = document.createElement('a');
        item.className = 'mobile-category-item';
        item.innerHTML = `<i class="fa fa-circle"></i> ${cat.name}`;
        item.addEventListener('click', () => {
            closeMenu();
            setTimeout(() => {
                window.location.hash = `category/${cat.id}`;
            }, 350);
        });
        categoriesSubmenu.appendChild(item);
    });
}

/* ===== Scroll To Top ===== */
function setupScrollToTop() {
    const btn = document.getElementById('scroll-top-btn');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
