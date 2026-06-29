/* ===== Firebase & Storage Setup ===== */
const db      = firebase.firestore();
const storage = firebase.storage();

/* ===== In-Memory Data ===== */
let categories = [];
let products   = [];
let banners    = [];
let portfolio  = [];
let settings   = {};

/* ===== Admin Login Gate ===== */
const adminLoginScreen = document.getElementById('admin-login-screen');

window.addEventListener('DOMContentLoaded', async () => {
    if (sessionStorage.getItem('samioLoggedIn') === 'true') {
        adminLoginScreen.style.display = 'none';
    }
    await initDatabase();
    initTabs();
    renderCategoryPanel();
    renderProductPanel();
    renderBannerPanel();
    renderPortfolioPanel();
    loadSettingsForm();
    setupLivePreviews();
    setupUploadZones();
    populateProductCategoryDropdowns();
});

document.getElementById('login-form-submit').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    if (user === 'admin' && pass === 'samio2026') {
        sessionStorage.setItem('samioLoggedIn', 'true');
        showNotification('Portal authenticated! Welcome back.');
        adminLoginScreen.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => adminLoginScreen.style.display = 'none', 300);
    } else {
        showNotification('Invalid user ID or security password.', true);
    }
});

document.getElementById('portal-logout-btn').addEventListener('click', () => {
    if (confirm('Verify terminating administrative session dashboard?')) {
        sessionStorage.removeItem('samioLoggedIn');
        window.location.reload();
    }
});

/* ===== Tab Engine ===== */
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-panel')).classList.add('active');
        });
    });
}

/* ===== Firestore Helpers ===== */
async function initDatabase() {
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
        settings   = settingsDoc.exists ? settingsDoc.data() : {};
        updateStatsCounter();
    } catch (err) {
        console.error('Firestore load error:', err.code, err.message);
        if (err.code === 'permission-denied') {
            showNotification('Permission denied — set Firestore rules to allow read/write.', true);
        } else if (err.code === 'unavailable' || err.message?.includes('NOT_FOUND')) {
            showNotification('Firestore database not created yet — create it in Firebase Console.', true);
        } else {
            showNotification('Database error: ' + (err.message || err.code), true);
        }
    }
}

function updateStatsCounter() {
    document.getElementById('stat-total-categories').textContent = categories.length;
    document.getElementById('stat-total-products').textContent = products.length;
    document.getElementById('stat-total-featured').textContent = products.filter(p => p.featured).length;
}

function nextId(arr) {
    return arr.length > 0 ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1;
}

/* ===== Google Drive URL Converter ===== */
// Converts share-page links into direct embeddable image URLs
function convertToDirectImageUrl(url) {
    if (!url) return url;
    url = url.trim();

    // Google Drive: /file/d/FILE_ID/view  OR  /file/d/FILE_ID?...
    const driveFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFile) return `https://lh3.googleusercontent.com/d/${driveFile[1]}`;

    // Google Drive: /open?id=FILE_ID
    const driveOpen = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (driveOpen) return `https://lh3.googleusercontent.com/d/${driveOpen[1]}`;

    // Google Drive: /uc?id=FILE_ID or /uc?export=...&id=FILE_ID
    const driveUc = url.match(/drive\.google\.com\/uc[^?]*\?.*[?&]?id=([a-zA-Z0-9_-]+)/);
    if (driveUc) return `https://lh3.googleusercontent.com/d/${driveUc[1]}`;

    // Google Drive thumbnail URL pattern
    const driveThumbnail = url.match(/drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]+)/);
    if (driveThumbnail) return `https://lh3.googleusercontent.com/d/${driveThumbnail[1]}`;

    // Google Photos share link (short URL like photos.app.goo.gl) — cannot auto-convert
    // User must open the photo and copy the lh3.googleusercontent.com URL directly
    if (url.includes('photos.app.goo.gl') || url.includes('photos.google.com/photo/')) {
        showNotification('Google Photos: open photo → right-click image → "Copy image address" to get a usable URL.', true);
        return '';
    }

    // Already a direct lh3 URL
    if (url.includes('lh3.googleusercontent.com')) return url;

    return url;
}

// Convert all URLs in a comma-separated string
function convertUrlList(raw) {
    return raw.split(',')
        .map(u => convertToDirectImageUrl(u.trim()))
        .filter(Boolean)
        .join(', ');
}

/* ===== Storage Upload Helper ===== */
async function uploadFile(file, path, progressBarId, progressContainerId) {
    const container = document.getElementById(progressContainerId);
    const bar = document.getElementById(progressBarId);
    container.style.display = 'block';
    bar.style.width = '0%';

    return new Promise((resolve, reject) => {
        try {
            const ref = storage.ref().child(path);
            const task = ref.put(file);
            task.on('state_changed',
                snap => {
                    const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
                    bar.style.width = pct + '%';
                },
                err => {
                    container.style.display = 'none';
                    console.error('Storage error:', err.code, err.message);
                    reject(err);
                },
                async () => {
                    try {
                        const url = await task.snapshot.ref.getDownloadURL();
                        container.style.display = 'none';
                        resolve(url);
                    } catch (e) { container.style.display = 'none'; reject(e); }
                }
            );
        } catch (err) {
            container.style.display = 'none';
            reject(err);
        }
    });
}

function uploadErrorMessage(err) {
    if (!err) return 'Upload failed.';
    if (err.code === 'storage/unauthorized')   return 'Storage permission denied — enable Firebase Storage and set rules to allow write.';
    if (err.code === 'storage/bucket-not-found') return 'Storage bucket not found — enable Firebase Storage in Firebase Console.';
    if (err.code === 'storage/canceled')       return 'Upload was cancelled.';
    if (err.code === 'storage/retry-limit-exceeded') return 'Network error — check your internet connection.';
    return 'Upload failed: ' + (err.code || err.message || 'Unknown error');
}

/* ===== Notifications ===== */
function showNotification(msg, isError = false) {
    const toast = document.getElementById('admin-notification-toast');
    toast.textContent = msg;
    toast.className = isError ? 'notification error show' : 'notification show';
    setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ===== Live URL Preview ===== */
// Live URL preview + auto-convert Google Drive links
function setupLivePreviews() {
    setupPreview('category-image-field', 'category-img-preview-box', 'category-img-preview-tag');
    setupPreview('product-images-field',  'product-img-preview-box',  'product-img-preview-tag');
    // Banner and portfolio URL fields (no preview box, just conversion)
    setupUrlConversion('banner-image-field');
    setupUrlConversion('portfolio-image-field');
}

function setupPreview(inputId, boxId, tagId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const box = document.getElementById(boxId);
    const tag = document.getElementById(tagId);

    function refresh() {
        const firstUrl = convertToDirectImageUrl(input.value.trim().split(',')[0].trim());
        if (firstUrl && firstUrl.startsWith('http')) {
            tag.src = firstUrl;
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    }

    // Auto-convert Google Drive URLs when user pastes
    input.addEventListener('paste', () => setTimeout(() => {
        const converted = convertUrlList(input.value);
        if (converted !== input.value) input.value = converted;
        refresh();
    }, 80));

    input.addEventListener('input', refresh);
}

// For URL fields without preview boxes
function setupUrlConversion(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('paste', () => setTimeout(() => {
        const converted = convertToDirectImageUrl(input.value.trim());
        if (converted && converted !== input.value) input.value = converted;
    }, 80));
}

/* ===== Upload Zone Drag Highlight ===== */
function setupUploadZones() {
    document.querySelectorAll('.upload-zone').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); });
    });
}

/* ===== Form UI Helpers ===== */
function toggleForm(formId) {
    document.getElementById(formId).classList.toggle('active');
}

function closeForm(formId, formElementId) {
    document.getElementById(formId).classList.remove('active');
    document.getElementById(formElementId).reset();
    const hidden = document.getElementById(formElementId).querySelector('input[type="hidden"]');
    if (hidden) hidden.value = '';
    const prevBox = document.getElementById(formId).querySelector('.quick-preview-box');
    if (prevBox) prevBox.style.display = 'none';
}

/* ===== Categories CRUD ===== */
function renderCategoryPanel() {
    const tbody = document.getElementById('categories-tbody');
    tbody.innerHTML = '';
    categories.forEach(cat => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${cat.coverImage}" class="table-img" alt="${cat.name}"></td>
            <td><strong style="color:var(--navy-dark);">${cat.name}</strong></td>
            <td style="color:var(--text-muted); font-size:0.9rem;">${cat.description || 'No description'}</td>
            <td><div class="action-row-btns">
                <button class="row-btn edit" onclick="editCategoryTrigger(${cat.id})">Edit</button>
                <button class="row-btn delete" onclick="deleteCategoryTrigger(${cat.id})">Delete</button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

document.getElementById('category-crud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id          = document.getElementById('category-id-field').value;
    const name        = document.getElementById('category-name-field').value.trim();
    const description = document.getElementById('category-desc-field').value.trim();
    const fileInput   = document.getElementById('category-image-file');
    let   coverImage  = document.getElementById('category-image-field').value.trim();

    // Convert Google Drive/Photos URL if pasted
    coverImage = convertToDirectImageUrl(coverImage);

    if (fileInput.files[0]) {
        try {
            showNotification('Uploading image…');
            coverImage = await uploadFile(
                fileInput.files[0],
                `categories/${Date.now()}_${fileInput.files[0].name}`,
                'category-upload-bar', 'category-upload-progress'
            );
        } catch(err) { showNotification(uploadErrorMessage(err), true); return; }
    }

    if (!coverImage) { showNotification('Please upload an image or enter a valid URL.', true); return; }

    const docId  = id ? String(id) : String(nextId(categories));
    const newCat = { id: parseInt(docId), name, coverImage, description };

    try {
        await db.collection('categories').doc(docId).set(newCat);
        if (id) {
            const idx = categories.findIndex(c => c.id == id);
            if (idx !== -1) categories[idx] = newCat;
            showNotification('Category updated successfully!');
        } else {
            categories.push(newCat);
            showNotification('Category added successfully!');
        }
        updateStatsCounter();
        renderCategoryPanel();
        populateProductCategoryDropdowns();
        closeForm('category-form-section', 'category-crud-form');
    } catch { showNotification('Save failed. Check Firestore rules.', true); }
});

function editCategoryTrigger(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('category-id-field').value    = cat.id;
    document.getElementById('category-name-field').value  = cat.name;
    document.getElementById('category-image-field').value = cat.coverImage;
    document.getElementById('category-desc-field').value  = cat.description || '';
    const tag = document.getElementById('category-img-preview-tag');
    tag.src = cat.coverImage;
    document.getElementById('category-img-preview-box').style.display = 'block';
    document.getElementById('category-form-header-title').innerHTML = '<i class="fa fa-edit"></i> Edit Product Category';
    document.getElementById('category-form-section').classList.add('active');
    document.getElementById('category-form-section').scrollIntoView({ behavior: 'smooth' });
}

async function deleteCategoryTrigger(id) {
    if (!confirm('Delete this category? Products in it will become unassigned.')) return;
    try {
        await db.collection('categories').doc(String(id)).delete();
        categories = categories.filter(c => c.id !== id);
        updateStatsCounter();
        renderCategoryPanel();
        populateProductCategoryDropdowns();
        showNotification('Category deleted!');
    } catch { showNotification('Delete failed.', true); }
}

/* ===== Products CRUD ===== */
function renderProductPanel(filterCategory = 'all') {
    const tbody = document.getElementById('products-tbody');
    tbody.innerHTML = '';
    const filtered = filterCategory === 'all' ? products : products.filter(p => p.categoryId == filterCategory);
    filtered.forEach(p => {
        const catObj = categories.find(c => c.id === p.categoryId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${p.images && p.images[0] ? p.images[0] : ''}" class="table-img" alt="${p.name}"></td>
            <td><strong style="color:var(--navy-dark);">${p.name}</strong><br>
                <span style="font-size:0.8rem;color:var(--text-muted);">${p.description.substring(0,60)}…</span></td>
            <td style="font-weight:600;color:var(--gold-primary);">${catObj ? catObj.name : 'Unassigned'}</td>
            <td>${p.featured ? '<span style="color:#10b981;font-weight:700;"><i class="fa fa-check"></i> Featured</span>' : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td><span style="font-size:0.8rem;background:var(--bg-tertiary);padding:4px 8px;border-radius:4px;">${p.tags ? p.tags.slice(0,3).join(', ') : 'no tags'}</span></td>
            <td><div class="action-row-btns">
                <button class="row-btn edit" onclick="editProductTrigger(${p.id})">Edit</button>
                <button class="row-btn delete" onclick="deleteProductTrigger(${p.id})">Delete</button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function populateProductCategoryDropdowns() {
    const filterSelect = document.getElementById('product-category-filter');
    const formSelect   = document.getElementById('product-cat-field');
    filterSelect.innerHTML = '<option value="all">Display All Products</option>';
    formSelect.innerHTML = '';
    categories.forEach(cat => {
        filterSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        formSelect.innerHTML   += `<option value="${cat.id}">${cat.name}</option>`;
    });
}

document.getElementById('product-category-filter').addEventListener('change', e => renderProductPanel(e.target.value));

document.getElementById('product-crud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id          = document.getElementById('product-id-field').value;
    const name        = document.getElementById('product-name-field').value.trim();
    const categoryId  = parseInt(document.getElementById('product-cat-field').value);
    const description = document.getElementById('product-desc-field').value.trim();
    const tagsStr     = document.getElementById('product-tags-field').value.trim();
    const featured    = document.getElementById('product-featured-field').checked;
    const tags        = tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const fileInput   = document.getElementById('product-image-file');
    let   imagesStr   = document.getElementById('product-images-field').value.trim();
    let   images      = imagesStr.split(',').map(u => u.trim()).filter(Boolean);

    // Convert any Google Drive/Photos URLs in the list
    images = images.map(u => convertToDirectImageUrl(u)).filter(Boolean);

    if (fileInput.files.length) {
        try {
            showNotification('Uploading images…');
            const uploaded = [];
            for (const file of fileInput.files) {
                const url = await uploadFile(
                    file,
                    `products/${Date.now()}_${file.name}`,
                    'product-upload-bar', 'product-upload-progress'
                );
                uploaded.push(url);
            }
            images = [...uploaded, ...images];
        } catch(err) { showNotification(uploadErrorMessage(err), true); return; }
    }

    if (!images.length) { showNotification('Please upload at least one image or enter a valid URL.', true); return; }

    const docId   = id ? String(id) : String(nextId(products));
    const newProd = { id: parseInt(docId), name, categoryId, description, images, tags, featured };

    try {
        await db.collection('products').doc(docId).set(newProd);
        if (id) {
            const idx = products.findIndex(p => p.id == id);
            if (idx !== -1) products[idx] = newProd;
            showNotification('Product updated successfully!');
        } else {
            products.push(newProd);
            showNotification('Product added to catalogue!');
        }
        updateStatsCounter();
        renderProductPanel();
        closeForm('product-form-section', 'product-crud-form');
    } catch { showNotification('Save failed. Check Firestore rules.', true); }
});

function editProductTrigger(id) {
    const p = products.find(p => p.id === id);
    if (!p) return;
    document.getElementById('product-id-field').value       = p.id;
    document.getElementById('product-name-field').value     = p.name;
    document.getElementById('product-cat-field').value      = p.categoryId;
    document.getElementById('product-desc-field').value     = p.description;
    document.getElementById('product-images-field').value   = p.images.join(', ');
    document.getElementById('product-tags-field').value     = p.tags ? p.tags.join(', ') : '';
    document.getElementById('product-featured-field').checked = p.featured;
    if (p.images[0]) {
        document.getElementById('product-img-preview-tag').src = p.images[0];
        document.getElementById('product-img-preview-box').style.display = 'block';
    }
    document.getElementById('product-form-header-title').innerHTML = '<i class="fa fa-edit"></i> Edit Showcase Product';
    document.getElementById('product-form-section').classList.add('active');
    document.getElementById('product-form-section').scrollIntoView({ behavior: 'smooth' });
}

async function deleteProductTrigger(id) {
    if (!confirm('Delete this product from the catalogue?')) return;
    try {
        await db.collection('products').doc(String(id)).delete();
        products = products.filter(p => p.id !== id);
        updateStatsCounter();
        renderProductPanel();
        showNotification('Product deleted!');
    } catch { showNotification('Delete failed.', true); }
}

/* ===== Banners CRUD ===== */
function renderBannerPanel() {
    const tbody = document.getElementById('banners-tbody');
    tbody.innerHTML = '';
    banners.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${b.image}" class="table-img" style="width:120px;height:50px;" alt="Banner"></td>
            <td><button class="row-btn ${b.active ? 'edit' : 'delete'}" onclick="toggleBannerActive(${b.id})">
                ${b.active ? '<i class="fa fa-toggle-on"></i> Active' : '<i class="fa fa-toggle-off"></i> Disabled'}
            </button></td>
            <td><div class="action-row-btns">
                <button class="row-btn edit" onclick="editBannerTrigger(${b.id})">Edit</button>
                <button class="row-btn delete" onclick="deleteBannerTrigger(${b.id})">Delete</button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

async function toggleBannerActive(id) {
    const b = banners.find(b => b.id === id);
    if (!b) return;
    b.active = !b.active;
    try {
        await db.collection('banners').doc(String(id)).update({ active: b.active });
        renderBannerPanel();
        showNotification('Banner status updated!');
    } catch { showNotification('Update failed.', true); }
}

document.getElementById('banner-crud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id        = document.getElementById('banner-id-field').value;
    const active    = document.getElementById('banner-active-field').checked;
    const fileInput = document.getElementById('banner-image-file');
    let   image     = document.getElementById('banner-image-field').value.trim();

    image = convertToDirectImageUrl(image);

    if (fileInput.files[0]) {
        try {
            showNotification('Uploading banner image…');
            image = await uploadFile(
                fileInput.files[0],
                `banners/${Date.now()}_${fileInput.files[0].name}`,
                'banner-upload-bar', 'banner-upload-progress'
            );
        } catch(err) { showNotification(uploadErrorMessage(err), true); return; }
    }

    if (!image) { showNotification('Please upload an image or enter a valid URL.', true); return; }

    const docId    = id ? String(id) : String(nextId(banners));
    const newBanner = { id: parseInt(docId), image, active };

    try {
        await db.collection('banners').doc(docId).set(newBanner);
        if (id) {
            const idx = banners.findIndex(b => b.id == id);
            if (idx !== -1) banners[idx] = newBanner;
            showNotification('Banner updated!');
        } else {
            banners.push(newBanner);
            showNotification('Banner slide added!');
        }
        renderBannerPanel();
        closeForm('banner-form-section', 'banner-crud-form');
    } catch { showNotification('Save failed.', true); }
});

function editBannerTrigger(id) {
    const b = banners.find(b => b.id === id);
    if (!b) return;
    document.getElementById('banner-id-field').value    = b.id;
    document.getElementById('banner-image-field').value = b.image;
    document.getElementById('banner-active-field').checked = b.active;
    document.getElementById('banner-form-header-title').innerHTML = '<i class="fa fa-edit"></i> Edit Banner';
    document.getElementById('banner-form-section').classList.add('active');
    document.getElementById('banner-form-section').scrollIntoView({ behavior: 'smooth' });
}

async function deleteBannerTrigger(id) {
    if (!confirm('Remove this banner slide?')) return;
    try {
        await db.collection('banners').doc(String(id)).delete();
        banners = banners.filter(b => b.id !== id);
        renderBannerPanel();
        showNotification('Banner removed!');
    } catch { showNotification('Delete failed.', true); }
}

/* ===== Portfolio CRUD ===== */
function renderPortfolioPanel() {
    const tbody = document.getElementById('portfolio-tbody');
    tbody.innerHTML = '';
    portfolio.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${item.image}" class="table-img" alt="${item.title}"></td>
            <td><strong style="color:var(--navy-dark);">${item.title}</strong></td>
            <td style="font-weight:600;color:var(--navy-light);">${item.clientName}</td>
            <td><span style="font-size:0.8rem;background:var(--gold-cream);color:#b08d20;padding:4px 10px;border-radius:30px;font-weight:700;">${item.tag}</span></td>
            <td><div class="action-row-btns">
                <button class="row-btn edit" onclick="editPortfolioTrigger(${item.id})">Edit</button>
                <button class="row-btn delete" onclick="deletePortfolioTrigger(${item.id})">Delete</button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

document.getElementById('portfolio-crud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id         = document.getElementById('portfolio-id-field').value;
    const title      = document.getElementById('portfolio-title-field').value.trim();
    const clientName = document.getElementById('portfolio-client-field').value.trim();
    const tag        = document.getElementById('portfolio-tag-field').value;
    const fileInput  = document.getElementById('portfolio-image-file');
    let   image      = document.getElementById('portfolio-image-field').value.trim();

    image = convertToDirectImageUrl(image);

    if (fileInput.files[0]) {
        try {
            showNotification('Uploading portfolio photo…');
            image = await uploadFile(
                fileInput.files[0],
                `portfolio/${Date.now()}_${fileInput.files[0].name}`,
                'portfolio-upload-bar', 'portfolio-upload-progress'
            );
        } catch(err) { showNotification(uploadErrorMessage(err), true); return; }
    }

    if (!image) { showNotification('Please upload a photo or enter a valid URL.', true); return; }

    const docId   = id ? String(id) : String(nextId(portfolio));
    const newItem = { id: parseInt(docId), title, clientName, tag, image };

    try {
        await db.collection('portfolio').doc(docId).set(newItem);
        if (id) {
            const idx = portfolio.findIndex(p => p.id == id);
            if (idx !== -1) portfolio[idx] = newItem;
            showNotification('Portfolio item updated!');
        } else {
            portfolio.push(newItem);
            showNotification('Portfolio photo added!');
        }
        renderPortfolioPanel();
        closeForm('portfolio-form-section', 'portfolio-crud-form');
    } catch { showNotification('Save failed.', true); }
});

function editPortfolioTrigger(id) {
    const item = portfolio.find(p => p.id === id);
    if (!item) return;
    document.getElementById('portfolio-id-field').value     = item.id;
    document.getElementById('portfolio-title-field').value  = item.title;
    document.getElementById('portfolio-client-field').value = item.clientName;
    document.getElementById('portfolio-tag-field').value    = item.tag;
    document.getElementById('portfolio-image-field').value  = item.image;
    document.getElementById('portfolio-form-header-title').innerHTML = '<i class="fa fa-edit"></i> Edit Portfolio';
    document.getElementById('portfolio-form-section').classList.add('active');
    document.getElementById('portfolio-form-section').scrollIntoView({ behavior: 'smooth' });
}

async function deletePortfolioTrigger(id) {
    if (!confirm('Delete this portfolio item?')) return;
    try {
        await db.collection('portfolio').doc(String(id)).delete();
        portfolio = portfolio.filter(p => p.id !== id);
        renderPortfolioPanel();
        showNotification('Portfolio item removed!');
    } catch { showNotification('Delete failed.', true); }
}

/* ===== Settings ===== */
function loadSettingsForm() {
    document.getElementById('settings-whatsapp-field').value = settings.whatsappNumber || '8801711223344';
    document.getElementById('settings-seo-title').value      = settings.seoTitle || '';
    document.getElementById('settings-seo-desc').value       = settings.seoDescription || '';
    document.getElementById('settings-seo-keywords').value   = settings.seoKeywords || '';
}

document.getElementById('global-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const whatsappNumber  = document.getElementById('settings-whatsapp-field').value.trim().replace(/\D/g, '');
    const seoTitle        = document.getElementById('settings-seo-title').value.trim();
    const seoDescription  = document.getElementById('settings-seo-desc').value.trim();
    const seoKeywords     = document.getElementById('settings-seo-keywords').value.trim();

    settings = { whatsappNumber, seoTitle, seoDescription, seoKeywords };
    try {
        await db.doc('settings/main').set(settings);
        showNotification('Settings saved successfully!');
    } catch { showNotification('Save failed. Check Firestore rules.', true); }
});

/* ===== Demo Data Seeder ===== */
async function resetDemoData() {
    if (!confirm('This will delete ALL data in Firestore and re-seed with demo content. Continue?')) return;

    const demoCategories = [
        { id: 1, name: 'Commemorative Crests', coverImage: 'https://picsum.photos/seed/awardcrest/400/300.jpg', description: 'Premium glass, crystal, wooden, and acrylic awards for high honors.' },
        { id: 2, name: 'Custom Printed Mugs', coverImage: 'https://picsum.photos/seed/printedmug/400/300.jpg', description: 'Ceramic photo mugs, promotional logo mugs, and executive cups.' },
        { id: 3, name: 'Executive Diaries & Notebooks', coverImage: 'https://picsum.photos/seed/notebook/400/300.jpg', description: 'Leather planners, customized corporate diaries, and organizer pens.' },
        { id: 4, name: 'Premium Key Rings', coverImage: 'https://picsum.photos/seed/keyring/400/300.jpg', description: 'Premium engraved metal key rings and customized acrylic key chains.' },
        { id: 5, name: 'Office Accessories', coverImage: 'https://picsum.photos/seed/office/400/300.jpg', description: 'Desk organizers, customized pen drives, calendar stands, and cardholders.' },
        { id: 6, name: 'Corporate Gift Boxes', coverImage: 'https://picsum.photos/seed/giftbox/400/300.jpg', description: 'Tailored luxury packages containing executive items for guests.' },
        { id: 7, name: 'Water Bottles & Flasks', coverImage: 'https://picsum.photos/seed/flask/400/300.jpg', description: 'Insulated steel flasks, sports cups, and personalized thermal bottles.' },
        { id: 8, name: 'Promotional Apparel', coverImage: 'https://picsum.photos/seed/apparel/400/300.jpg', description: 'Custom printed polo shirts, t-shirts, caps, and canvas bags.' }
    ];
    const demoBanners = [
        { id: 1, image: 'https://picsum.photos/seed/banneraward/1920/600.jpg', active: true },
        { id: 2, image: 'https://picsum.photos/seed/bannergift/1920/600.jpg', active: true },
        { id: 3, image: 'https://picsum.photos/seed/bannermug/1920/600.jpg', active: true }
    ];
    const demoPortfolio = [
        { id: 1, title: 'Rakuten annual gala crest awards', clientName: 'Rakuten BD', tag: 'Crests', image: 'https://picsum.photos/seed/pw1/500/600.jpg' },
        { id: 2, title: 'Matte black corporate mug series', clientName: 'Pathao Ltd.', tag: 'Mugs', image: 'https://picsum.photos/seed/pw2/500/400.jpg' },
        { id: 3, title: 'Executive leather organizer kit', clientName: 'Robi Axiata', tag: 'Diaries', image: 'https://picsum.photos/seed/pw3/500/500.jpg' },
        { id: 4, title: 'Laser engraved keychain bulk delivery', clientName: 'Chaldal BD', tag: 'Key Rings', image: 'https://picsum.photos/seed/pw4/500/450.jpg' },
        { id: 5, title: 'Employee onboarding gift packages', clientName: 'bKash Ltd.', tag: 'Gift Boxes', image: 'https://picsum.photos/seed/pw5/500/650.jpg' },
        { id: 6, title: 'Bamboo thermos bottles bulk order', clientName: 'Daraz BD', tag: 'Bottles', image: 'https://picsum.photos/seed/pw6/500/400.jpg' }
    ];
    const demoSettings = {
        whatsappNumber: '8801711223344',
        seoTitle: 'Samio Enterprise | Premium Corporate Gifts & Crest Awards Supplier BD',
        seoDescription: 'Samio Enterprise is the leading corporate gift, crest awards, and personalized printing supplier in Bangladesh.',
        seoKeywords: 'Corporate gift Bangladesh, Custom printed mug BD, Crest award supplier, Promotional items Bangladesh, Executive gifts Dhaka'
    };

    try {
        showNotification('Seeding demo data…');
        const batch = db.batch();
        demoCategories.forEach(c => batch.set(db.collection('categories').doc(String(c.id)), c));
        demoBanners.forEach(b => batch.set(db.collection('banners').doc(String(b.id)), b));
        demoPortfolio.forEach(p => batch.set(db.collection('portfolio').doc(String(p.id)), p));
        batch.set(db.doc('settings/main'), demoSettings);
        await batch.commit();
        showNotification('Demo data seeded! Reload to see changes.');
        setTimeout(() => window.location.reload(), 1500);
    } catch { showNotification('Seed failed. Check Firestore rules.', true); }
}
