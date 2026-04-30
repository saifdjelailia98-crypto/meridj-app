import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, getDoc,
         updateDoc, addDoc, orderBy, deleteDoc, onSnapshot, increment, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCwFucyWqdM9q5z096jMKm9jtfDVhW4vOE",
    authDomain: "matpin-14ed4.firebaseapp.com",
    projectId: "matpin-14ed4",
    storageBucket: "matpin-14ed4.firebasestorage.app",
    messagingSenderId: "1050663663411",
    appId: "1:1050663663411:web:fdc17a6ffc1a9929b47046"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const CLOUDINARY_URL    = "https://api.cloudinary.com/v1_1/dgc7sxidj/image/upload";
const CLOUDINARY_PRESET = "upload_images";

/* ─── state ─── */
const state = {
    userSession:       JSON.parse(localStorage.getItem('userSession')) || null,
    currentView:       'login',
    activePostId:      null,
    activePostOwnerId: null,
    viewedProfile:     null,
    activeChatUser:    null,
    chatUnsubscribe:   null,
    activeMarketTab:   'shops',
    activeShop:        null,
};

/* ─── helpers ─── */
const getChatId  = (a, b) => [a, b].sort().join('_');
const showLoader = () => document.getElementById('loader').style.display = 'flex';
const hideLoader = () => document.getElementById('loader').style.display = 'none';

const formatTime = (date) => {
    if (!date) return '';
    const diff = Date.now() - date;
    if (diff < 60000)    return 'الآن';
    if (diff < 3600000)  return `${Math.floor(diff/60000)}د`;
    if (diff < 86400000) return date.toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'});
    return date.toLocaleDateString('ar');
};

const formatPostDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    const diff = Date.now() - d;
    if (diff < 60000)     return 'الآن';
    if (diff < 3600000)   return `منذ ${Math.floor(diff/60000)} دقيقة`;
    if (diff < 86400000)  return `منذ ${Math.floor(diff/3600000)} ساعة`;
    if (diff < 604800000) return `منذ ${Math.floor(diff/86400000)} يوم`;
    return d.toLocaleDateString('ar-DZ',{year:'numeric',month:'short',day:'numeric'});
};

const uploadToCloudinary = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    const res = await fetch(CLOUDINARY_URL, {method:'POST', body:fd});
    return (await res.json()).secure_url;
};

/* ─── photo cache ─── */
const _photoCache = {};
const getUserPhoto = async (uid) => {
    if (!uid) return 'https://via.placeholder.com/40';
    if (_photoCache[uid]) return _photoCache[uid];
    if (uid === state.userSession?.phone && state.userSession.photoUrl) {
        _photoCache[uid] = state.userSession.photoUrl;
        return state.userSession.photoUrl;
    }
    try {
        const s = await getDoc(doc(db,'users',uid));
        const p = s.exists() ? (s.data().photoUrl||'https://via.placeholder.com/40') : 'https://via.placeholder.com/40';
        _photoCache[uid] = p;
        return p;
    } catch { return 'https://via.placeholder.com/40'; }
};

/* ─── ONLINE STATUS ─── */
const setOnlineStatus = async (online) => {
    if (!state.userSession?.phone) return;
    await updateDoc(doc(db,'users',state.userSession.phone), {
        online, lastSeen: serverTimestamp()
    }).catch(()=>{});
};

/* فحص الاتصال مع re-fetch دائم لضمان الدقة */
const isOnline = async (phone) => {
    try {
        const s = await getDoc(doc(db,'users',phone));
        if (!s.exists()) return false;
        const d = s.data();
        if (!d.online) return false;
        const last = d.lastSeen?.toDate?.();
        if (!last) return false;
        return (Date.now() - last) < 180000; // 3 دقائق
    } catch { return false; }
};

/* مراقبة نقطة اتصال مستخدم معين (realtime) */
const watchOnlineDot = (phone, dotEl) => {
    if (!dotEl) return () => {};
    return onSnapshot(doc(db,'users',phone), snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        const last = d.lastSeen?.toDate?.();
        const on = d.online && last && (Date.now() - last) < 180000;
        dotEl.classList.toggle('show', on);
    });
};

// =====================================================================
//  VIEWS
// =====================================================================

const views = {

    login: () => `
        <div class="auth-container">
            <div style="text-align:center">
                <h2 style="color:var(--primary-color);margin-bottom:6px">مرحباً بك</h2>
                <p style="color:#636e72;font-size:0.9rem">AL-MURAIJ Glass Edition</p>
            </div>
            <div class="form-group"><input type="tel"      id="login-phone" placeholder="رقم الهاتف"></div>
            <div class="form-group"><input type="password" id="login-pass"  placeholder="كلمة السر"></div>
            <button class="btn-primary" id="btn-login">دخول</button>
            <div class="auth-switch" id="switch-to-signup">ليس لديك حساب؟ إنشاء حساب</div>
        </div>`,

    signup: () => `
        <div class="auth-container">
            <div style="text-align:center"><h2 style="color:var(--primary-color)">حساب جديد</h2></div>
            <div class="form-group"><input type="tel"      id="signup-phone" placeholder="رقم الهاتف"></div>
            <div class="form-group"><input type="password" id="signup-pass"  placeholder="كلمة السر"></div>
            <button class="btn-primary" id="btn-signup">تسجيل</button>
            <div class="auth-switch" id="switch-to-login">لديك حساب؟ دخول</div>
        </div>`,

    setupProfile: () => `
        <div class="auth-container">
            <div style="text-align:center"><h2 style="color:var(--primary-color)">إكمال الملف الشخصي</h2></div>
            <div class="form-group"><input type="text" id="p-name"     placeholder="الاسم"></div>
            <div class="form-group"><input type="text" id="p-surname"  placeholder="اللقب"></div>
            <div class="form-group"><input type="text" id="p-bio"      placeholder="نبذة عنك"></div>
            <div class="form-group"><input type="text" id="p-location" placeholder="الموقع"></div>
            <div class="form-group"><input type="date" id="p-dob"></div>
            <button class="btn-primary" id="btn-save-profile">حفظ والمتابعة</button>
        </div>`,

    home: () => `
        <div class="composer-wrapper">
            <div class="composer-bar" id="composer-trigger">
                <i class="fas fa-pen" style="color:var(--primary-color)"></i>
                <input type="text" placeholder="ماذا يحدث في المريج؟" readonly>
            </div>
            <div class="composer-expanded" id="composer-box">
                <textarea class="composer-textarea" id="post-text" placeholder="اكتب هنا..."></textarea>
                <div id="composer-img-preview" class="composer-img-preview"></div>
                <div class="composer-footer">
                    <label style="cursor:pointer">
                        <i class="fas fa-image" style="color:var(--primary-color);font-size:1.3rem"></i>
                        <input type="file" id="post-image-file" style="display:none" accept="image/*">
                    </label>
                    <button class="btn-post" id="btn-submit-post">نشر</button>
                </div>
            </div>
        </div>
        <div id="feed-container"></div>`,

    /* ── ملفي الشخصي ── */
    profile: () => {
        const u = state.userSession;
        const photo = u.photoUrl || 'https://via.placeholder.com/100';
        return `
            <div class="profile-container">
                <div class="profile-info">
                    <div class="avatar-wrapper">
                        <img src="${photo}" alt="">
                        <div class="profile-online-dot show"></div>
                        <label class="avatar-edit-btn">
                            <i class="fas fa-camera"></i>
                            <input type="file" id="avatar-upload" style="display:none" accept="image/*">
                        </label>
                    </div>
                    <h3>${u.name||''} ${u.surname||''}</h3>
                    <div class="profile-bio">${u.bio||'لا يوجد نبذة شخصية'}</div>
                    <div class="profile-detail"><i class="fas fa-map-marker-alt"></i> ${u.location||'غير محدد'}</div>
                    <div class="profile-detail"><i class="fas fa-calendar"></i> ${u.dob||'غير محدد'}</div>
                    <!-- إحصائيات -->
                    <div class="profile-stats" id="my-profile-stats">
                        <div class="stat-item" id="stat-posts">
                            <span class="stat-num" id="stat-posts-num">…</span>
                            <span class="stat-label">منشورات</span>
                        </div>
                        <div class="stat-item" id="stat-friends">
                            <span class="stat-num" id="stat-friends-num">…</span>
                            <span class="stat-label">أصدقاء</span>
                        </div>
                        <div class="stat-item" id="stat-followers">
                            <span class="stat-num" id="stat-followers-num">…</span>
                            <span class="stat-label">متابعون</span>
                        </div>
                        <div class="stat-item" id="stat-following">
                            <span class="stat-num" id="stat-following-num">…</span>
                            <span class="stat-label">متابَع</span>
                        </div>
                    </div>
                    <button class="edit-profile-btn" id="btn-edit-profile">تعديل المعلومات</button>
                </div>
                <h4 style="margin-bottom:15px;text-align:right">منشوراتي</h4>
                <div id="user-posts-feed" class="user-posts-grid"></div>
                <button class="btn-primary" style="background:var(--error-color);margin-top:30px" id="btn-logout">تسجيل الخروج</button>
            </div>`;
    },

    editProfile: () => {
        const u = state.userSession;
        return `
            <div class="auth-container">
                <div style="text-align:center"><h2 style="color:var(--primary-color)">تعديل الملف</h2></div>
                <div class="form-group"><input type="text" id="e-name"     value="${u.name||''}"     placeholder="الاسم"></div>
                <div class="form-group"><input type="text" id="e-surname"  value="${u.surname||''}"  placeholder="اللقب"></div>
                <div class="form-group"><textarea          id="e-bio"      placeholder="نبذة عنك">${u.bio||''}</textarea></div>
                <div class="form-group"><input type="text" id="e-location" value="${u.location||''}" placeholder="الموقع"></div>
                <button class="btn-primary" id="btn-update-profile">حفظ التغييرات</button>
                <button class="btn-primary" style="background:gray" id="btn-cancel-edit">إلغاء</button>
            </div>`;
    },

    friends: () => `
        <div class="friends-container">
            <div class="friends-tabs">
                <button class="friend-tab active" data-tab="all">الجميع</button>
                <button class="friend-tab" data-tab="requests">طلبات <span id="requests-badge" class="tab-badge"></span></button>
                <button class="friend-tab" data-tab="myfriends">أصدقائي</button>
            </div>
            <div id="tab-content"></div>
        </div>`,

    /* ── ملف شخصي مستخدم آخر ── */
    viewProfile: () => {
        const u = state.viewedProfile;
        if (!u) return '<p style="text-align:center">خطأ</p>';
        const photo = u.photoUrl || 'https://via.placeholder.com/100';
        return `
            <div class="profile-container">
                <button class="btn-back" id="btn-back-friends"><i class="fas fa-arrow-right"></i> رجوع</button>
                <div class="profile-info">
                    <div class="avatar-wrapper">
                        <img src="${photo}" alt="">
                        <div class="profile-online-dot" id="viewed-online-dot"></div>
                    </div>
                    <h3>${u.name||''} ${u.surname||''}</h3>
                    <div class="profile-bio">${u.bio||'لا يوجد نبذة'}</div>
                    <div class="profile-detail"><i class="fas fa-map-marker-alt"></i> ${u.location||'غير محدد'}</div>
                    <div class="profile-detail"><i class="fas fa-calendar"></i> ${u.dob||'غير محدد'}</div>
                    <!-- إحصائيات -->
                    <div class="profile-stats">
                        <div class="stat-item">
                            <span class="stat-num" id="vstat-posts-num">…</span>
                            <span class="stat-label">منشورات</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-num" id="vstat-friends-num">…</span>
                            <span class="stat-label">أصدقاء</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-num" id="vstat-followers-num">…</span>
                            <span class="stat-label">متابعون</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-num" id="vstat-following-num">…</span>
                            <span class="stat-label">متابَع</span>
                        </div>
                    </div>
                    <div class="profile-actions-group" id="profile-action-btn"></div>
                </div>
                <h4 style="margin-bottom:15px;text-align:right">منشوراته</h4>
                <div id="viewed-user-posts"></div>
            </div>`;
    },

    chat: () => `
        <div class="chat-container">
            <h3 class="chat-list-title"><i class="fas fa-comments"></i> المراسلة</h3>
            <div id="chat-list-container">
                <div style="text-align:center;margin-top:50px;color:#b2bec3">
                    <div class="spinner" style="width:28px;height:28px;margin:0 auto 12px"></div>
                    جاري التحميل...
                </div>
            </div>
        </div>`,

    chatRoom: () => {
        const u = state.activeChatUser;
        const photo = u.photoUrl || 'https://via.placeholder.com/40';
        return `
            <div class="chatroom-wrapper">
                <div class="chatroom-header">
                    <button class="btn-back-chat" id="btn-back-chat"><i class="fas fa-arrow-right"></i></button>
                    <div class="chatroom-avatar-wrap">
                        <img src="${photo}" class="chatroom-avatar" alt="">
                        <div class="chatroom-online" id="chatroom-online-dot"></div>
                    </div>
                    <div>
                        <div class="chatroom-name">${u.name||''} ${u.surname||''}</div>
                        <div id="chatroom-status" style="font-size:0.72rem;color:#b2bec3"></div>
                    </div>
                </div>
                <div class="chatroom-messages" id="chatroom-messages"></div>
                <div class="chatroom-input-bar">
                    <label class="chat-img-btn" title="إرسال صورة">
                        <i class="fas fa-image"></i>
                        <input type="file" id="chat-img-input" style="display:none" accept="image/*">
                    </label>
                    <input type="text" id="chat-input" class="chat-input" placeholder="اكتب رسالة...">
                    <button class="chat-send-btn" id="btn-send-chat"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>`;
    },

    notifications: () => `
        <div class="notif-container">
            <div class="notif-header-title"><i class="fas fa-bell"></i> الإشعارات</div>
            <button class="notif-mark-all" id="btn-mark-all-read">تحديد الكل كمقروء ✓</button>
            <div id="notif-list">
                <div style="text-align:center;padding:40px;color:#b2bec3">
                    <div class="spinner" style="width:26px;height:26px;margin:0 auto 10px"></div>
                </div>
            </div>
        </div>`,

    market: () => `
        <div class="market-container">
            <div class="market-header-title"><i class="fas fa-store"></i> السوق</div>
            <div class="market-tabs">
                <button class="market-tab ${state.activeMarketTab==='shops' ?'active':''}" data-tab="shops"><i class="fas fa-store-alt"></i><span>محلات</span></button>
                <button class="market-tab ${state.activeMarketTab==='random'?'active':''}" data-tab="random"><i class="fas fa-tags"></i><span>عشوائي</span></button>
                <button class="market-tab ${state.activeMarketTab==='cars'  ?'active':''}" data-tab="cars"><i class="fas fa-car"></i><span>سيارات</span></button>
            </div>
            <div id="market-tab-content"></div>
        </div>`,

    shopPage: () => {
        const s = state.activeShop;
        const logo  = s.logoUrl  || 'https://via.placeholder.com/80';
        const cover = s.coverUrl || '';
        const isOwner = s.ownerId === state.userSession.phone;
        return `
            <div class="shop-page">
                <button class="btn-back" id="btn-back-market"><i class="fas fa-arrow-right"></i> رجوع للسوق</button>
                <div class="shop-hero">
                    ${cover ? `<img src="${cover}" class="shop-cover" alt="">` : '<div class="shop-cover-placeholder"></div>'}
                    <img src="${logo}" class="shop-logo" alt="" onerror="this.src='https://via.placeholder.com/80'">
                    <div class="shop-hero-info">
                        <h2 class="shop-name">${s.name}</h2>
                        <p class="shop-owner-tag">🧑 ${s.ownerName||''}</p>
                        <p class="shop-desc">${s.description||''}</p>
                    </div>
                </div>
                ${isOwner ? `
                <div class="shop-owner-bar">
                    <button class="market-action-btn add-product-btn" id="btn-add-product"><i class="fas fa-plus"></i> إضافة منتج</button>
                    <label class="market-action-btn cover-btn" style="cursor:pointer">
                        <i class="fas fa-image"></i> الغلاف
                        <input type="file" id="shop-cover-upload" style="display:none" accept="image/*">
                    </label>
                </div>
                <div id="add-product-form" class="add-listing-form" style="display:none">
                    <h4 style="color:var(--primary-color)">منتج جديد</h4>
                    <input  type="text"   id="prod-name"  placeholder="اسم المنتج *" class="market-input">
                    <textarea             id="prod-desc"  placeholder="الوصف"         class="market-input market-textarea"></textarea>
                    <input  type="number" id="prod-price" placeholder="السعر (دج)"   class="market-input">
                    <label class="market-img-label"><i class="fas fa-camera"></i> صورة<input type="file" id="prod-img-file" style="display:none" accept="image/*"></label>
                    <div id="prod-img-preview"></div>
                    <button class="btn-post" id="btn-submit-product">نشر المنتج</button>
                </div>` : ''}
                <h4 class="products-title">المنتجات</h4>
                <div class="products-grid" id="shop-products-grid">
                    <div style="text-align:center;padding:30px;color:#b2bec3;grid-column:1/-1"><div class="spinner" style="width:24px;height:24px;margin:0 auto 8px"></div></div>
                </div>
            </div>`;
    },
};

// =====================================================================
//  RENDER
// =====================================================================

let _onlineDotUnsubs = [];

const renderView = async (viewName) => {
    // إلغاء مراقبة النقاط السابقة
    _onlineDotUnsubs.forEach(u => u());
    _onlineDotUnsubs = [];

    if (state.chatUnsubscribe && viewName !== 'chatRoom') {
        state.chatUnsubscribe();
        state.chatUnsubscribe = null;
    }

    const contentArea = document.getElementById('main-content');
    const header      = document.getElementById('main-header');
    const nav         = document.getElementById('main-nav');
    state.currentView = viewName;

    const noChrome = ['login','signup','setupProfile','editProfile'];
    header.style.display = noChrome.includes(viewName) ? 'none' : 'flex';
    nav.style.display    = noChrome.includes(viewName) ? 'none' : 'flex';

    contentArea.innerHTML = views[viewName] ? views[viewName]() : '<p style="text-align:center;margin-top:40px">الصفحة غير موجودة</p>';
    attachEventListeners(viewName);

    if (viewName === 'home')          loadFeed();
    if (viewName === 'profile')       { loadUserFeed(); loadMyProfileStats(); }
    if (viewName === 'friends')       { loadFriendsTab('all'); loadRequestsBadge(); }
    if (viewName === 'viewProfile')   { loadViewedUserPosts(); renderProfileAction(); loadViewedProfileStats(); startViewedOnlineWatch(); }
    if (viewName === 'chat')          loadChatList();
    if (viewName === 'chatRoom')      openChatRoom();
    if (viewName === 'notifications') loadNotifications();
    if (viewName === 'market')        loadMarketTab(state.activeMarketTab);
    if (viewName === 'shopPage')      loadShopProducts();
};

// =====================================================================
//  PROFILE STATS — عدد المنشورات + الأصدقاء + المتابعين
// =====================================================================

const loadMyProfileStats = async () => {
    const phone = state.userSession.phone;
    await fillProfileStats(phone, 'stat-posts-num','stat-friends-num','stat-followers-num','stat-following-num');
};

const loadViewedProfileStats = async () => {
    if (!state.viewedProfile) return;
    const phone = state.viewedProfile.phone;
    await fillProfileStats(phone,'vstat-posts-num','vstat-friends-num','vstat-followers-num','vstat-following-num');
};

const fillProfileStats = async (phone, postsId, friendsId, followersId, followingId) => {
    const [postsSnap, f1, f2, followersSnap, followingSnap] = await Promise.all([
        getDocs(query(collection(db,'posts'),          where('userId','==',phone))),
        getDocs(query(collection(db,'friendRequests'), where('from','==',phone), where('status','==','accepted'))),
        getDocs(query(collection(db,'friendRequests'), where('to','==',phone),   where('status','==','accepted'))),
        getDocs(query(collection(db,'follows'),        where('to','==',phone))),
        getDocs(query(collection(db,'follows'),        where('from','==',phone)))
    ]);
    const friends  = f1.size + f2.size;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set(postsId,     postsSnap.size);
    set(friendsId,   friends);
    set(followersId, followersSnap.size);
    set(followingId, followingSnap.size);
};

// =====================================================================
//  ONLINE DOT — مراقبة realtime للملف الشخصي المعروض
// =====================================================================

const startViewedOnlineWatch = () => {
    if (!state.viewedProfile) return;
    const dot = document.getElementById('viewed-online-dot');
    if (!dot) return;
    const unsub = watchOnlineDot(state.viewedProfile.phone, dot);
    _onlineDotUnsubs.push(unsub);
};

// =====================================================================
//  BADGE SYSTEM
// =====================================================================

let _badgeUnsubs = [];

const startBadgeListeners = () => {
    if (!state.userSession) return;
    const myPhone = state.userSession.phone;

    const chatUnsub = onSnapshot(
        query(collection(db,'conversations'), where('participants','array-contains',myPhone)),
        snap => {
            let total = 0;
            snap.forEach(d => { total += (d.data().unread?.[myPhone] || 0); });
            setBadge('chat', total);
        }
    );
    const friendUnsub = onSnapshot(
        query(collection(db,'friendRequests'), where('to','==',myPhone), where('status','==','pending')),
        snap => { setBadge('friends', snap.size); }
    );
    const notifUnsub = onSnapshot(
        query(collection(db,'notifications'), where('to','==',myPhone), where('read','==',false)),
        snap => { setHeaderBadge('notif-badge', snap.size); }
    );

    setOnlineStatus(true);
    const onlineInterval = setInterval(() => setOnlineStatus(true), 60000);

    _badgeUnsubs = [chatUnsub, friendUnsub, notifUnsub, () => { clearInterval(onlineInterval); setOnlineStatus(false); }];
};

const stopBadgeListeners = () => {
    _badgeUnsubs.forEach(u => (typeof u === 'function' ? u() : u()));
    _badgeUnsubs = [];
};

const setBadge = (navView, count) => {
    const item = document.querySelector(`.nav-item[data-view="${navView}"]`);
    if (!item) return;
    let badge = item.querySelector('.nav-badge');
    if (!badge) { badge = document.createElement('span'); badge.className='nav-badge'; item.appendChild(badge); }
    if (count > 0) { badge.textContent = count>99?'99+':count; badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
};

const setHeaderBadge = (id, count) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) { badge.textContent = count>99?'99+':count; badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
};

// =====================================================================
//  NOTIFICATIONS
// =====================================================================

const sendNotification = async (toPhone, type, text, extra={}) => {
    if (!toPhone || toPhone === state.userSession.phone) return;
    await addDoc(collection(db,'notifications'), {
        to:toPhone, from:state.userSession.phone,
        fromName: `${state.userSession.name||''} ${state.userSession.surname||''}`.trim(),
        fromPhoto: state.userSession.photoUrl||'',
        type, text, read:false, createdAt:serverTimestamp(), ...extra
    });
};

const loadNotifications = () => {
    const list    = document.getElementById('notif-list');
    const myPhone = state.userSession.phone;
    onSnapshot(query(collection(db,'notifications'), where('to','==',myPhone), orderBy('createdAt','desc')), snap => {
        if (snap.empty) { list.innerHTML=`<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>لا توجد إشعارات بعد</p></div>`; return; }
        const iconMap = {
            like:   {cls:'ni-like',   icon:'❤️'},
            comment:{cls:'ni-comment',icon:'💬'},
            friend: {cls:'ni-friend', icon:'👥'},
            message:{cls:'ni-message',icon:'✉️'},
            share:  {cls:'ni-share',  icon:'🔁'},
            follow: {cls:'ni-follow', icon:'➕'},
        };
        list.innerHTML='';
        snap.forEach(d => {
            const n  = d.data();
            const ic = iconMap[n.type]||{cls:'ni-friend',icon:'🔔'};
            const time = n.createdAt?.toDate ? formatTime(n.createdAt.toDate()) : '';
            const photo = n.fromPhoto||'https://via.placeholder.com/44';
            list.innerHTML += `
                <div class="notif-item ${n.read?'':'unread'}" onclick="window.markNotifRead('${d.id}','${n.from}','${n.type}')">
                    <div style="position:relative;flex-shrink:0">
                        <img src="${photo}" class="notif-avatar" alt="" onerror="this.src='https://via.placeholder.com/44'">
                        <span class="notif-icon-badge ${ic.cls}">${ic.icon}</span>
                    </div>
                    <div class="notif-body">
                        <div class="notif-text"><strong>${n.fromName}</strong> ${n.text}</div>
                        <div class="notif-time">${time}</div>
                    </div>
                </div>`;
        });
    });
};

window.markNotifRead = async (notifId, fromPhone, type) => {
    await updateDoc(doc(db,'notifications',notifId), {read:true});
    if (type==='friend') renderView('friends');
    else if (type==='message') window.openChat(fromPhone);
    else if (type==='follow') window.openUserProfile(fromPhone);
    else renderView('home');
};

// =====================================================================
//  REACTORS MODAL — من تفاعل مع المنشور
// =====================================================================

window.showReactors = async (postId) => {
    const snap = await getDoc(doc(db,'posts',postId));
    if (!snap.exists()) return;
    const userReactions = snap.data().user_reactions || {};

    const emojiMap2 = { heart:'❤️', like:'👍', laugh:'😂', wow:'😮', sad:'😢', angry:'😡' };

    // جلب بيانات المتفاعلين
    const phones = Object.keys(userReactions).filter(p => userReactions[p]);
    if (!phones.length) { alert('لا يوجد تفاعلات بعد'); return; }

    const usersData = await Promise.all(phones.map(async phone => {
        try {
            const us = await getDoc(doc(db,'users',phone));
            return us.exists() ? us.data() : {phone, name:phone, surname:'', photoUrl:''};
        } catch { return {phone, name:phone, surname:'', photoUrl:''}; }
    }));

    // بناء الـ modal
    let rows = '';
    for (const u of usersData) {
        const reaction = userReactions[u.phone];
        const photo    = u.photoUrl || 'https://via.placeholder.com/42';
        const emoji    = emojiMap2[reaction] || '👍';
        const on       = await isOnline(u.phone);
        rows += `
            <div class="reactor-row" onclick="window.closeModal();window.openUserProfile('${u.phone}')">
                <img src="${photo}" class="reactor-avatar" alt="" onerror="this.src='https://via.placeholder.com/42'">
                <div class="reactor-name">${u.name||''} ${u.surname||''}</div>
                <div class="reactor-online-dot ${on?'show':''}"></div>
                <span class="reactor-emoji">${emoji}</span>
            </div>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'reactors-modal';
    overlay.innerHTML = `
        <div class="modal-sheet" onclick="event.stopPropagation()">
            <div class="modal-handle"></div>
            <div class="modal-title">المتفاعلون (${phones.length})</div>
            ${rows}
        </div>`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
};

window.closeModal = () => {
    const m = document.getElementById('reactors-modal');
    if (m) m.remove();
};

// =====================================================================
//  CHAT
// =====================================================================

const loadChatList = () => {
    const container = document.getElementById('chat-list-container');
    const myPhone   = state.userSession.phone;
    onSnapshot(query(collection(db,'conversations'), where('participants','array-contains',myPhone)), async snap => {
        if (snap.empty) {
            container.innerHTML=`<div class="empty-chat"><i class="fas fa-comment-slash"></i><p>لا توجد محادثات بعد</p><p class="empty-sub">ابدأ محادثة من ملف أحد أصدقائك</p></div>`;
            return;
        }
        const sorted = snap.docs.sort((a,b) => {
            const ta=a.data().lastTimestamp?.toDate?.() || new Date(0);
            const tb=b.data().lastTimestamp?.toDate?.() || new Date(0);
            return tb - ta;
        });
        const cards = await Promise.all(sorted.map(async d => {
            const conv = d.data();
            const otherPhone = conv.participants.find(p=>p!==myPhone);
            let u = {phone:otherPhone,name:otherPhone,surname:'',photoUrl:''};
            try { const us=await getDoc(doc(db,'users',otherPhone)); if(us.exists()) u=us.data(); } catch {}
            const photo   = u.photoUrl||'https://via.placeholder.com/50';
            const lastMsg = conv.lastMessage||'';
            const unread  = conv.unread?.[myPhone]||0;
            const timeStr = conv.lastTimestamp?.toDate ? formatTime(conv.lastTimestamp.toDate()) : '';
            const online  = await isOnline(otherPhone);
            return `
                <div class="chat-list-item" onclick="window.openChat('${u.phone}')">
                    <div style="position:relative;flex-shrink:0">
                        <img src="${photo}" class="chat-list-avatar" alt="">
                        ${online?`<span style="position:absolute;bottom:-1px;left:-1px;width:13px;height:13px;background:var(--online-color);border-radius:50%;border:2px solid white;display:block"></span>`:''}
                        ${unread>0?`<span class="unread-dot">${unread}</span>`:''}
                    </div>
                    <div class="chat-list-info">
                        <div class="chat-list-name">${u.name||''} ${u.surname||''}</div>
                        <div class="chat-list-last">${lastMsg.substring(0,45)}${lastMsg.length>45?'...':''}</div>
                    </div>
                    <div class="chat-list-time">${timeStr}</div>
                </div>`;
        }));
        container.innerHTML = cards.join('');
    });
};

window.openChat = async (phone) => {
    const s = await getDoc(doc(db,'users',phone));
    state.activeChatUser = s.exists() ? s.data() : {phone,name:phone,surname:'',photoUrl:''};
    setActiveNav('chat');
    renderView('chatRoom');
};

const openChatRoom = () => {
    const myPhone    = state.userSession.phone;
    const theirPhone = state.activeChatUser.phone;
    const chatId     = getChatId(myPhone, theirPhone);
    const msgBox     = document.getElementById('chatroom-messages');

    setDoc(doc(db,'conversations',chatId), {[`unread.${myPhone}`]:0}, {merge:true}).catch(()=>{});

    // نقطة اتصال realtime
    const dot    = document.getElementById('chatroom-online-dot');
    const status = document.getElementById('chatroom-status');
    const unsub  = watchOnlineDot(theirPhone, dot);
    _onlineDotUnsubs.push(unsub);
    // نص الحالة
    onSnapshot(doc(db,'users',theirPhone), snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        const last = d.lastSeen?.toDate?.();
        const on = d.online && last && (Date.now()-last)<180000;
        if (status) status.textContent = on ? '🟢 متصل الآن' : '';
    });

    const q = query(collection(db,`conversations/${chatId}/messages`), orderBy('timestamp','asc'));
    state.chatUnsubscribe = onSnapshot(q, snap => {
        msgBox.innerHTML='';
        snap.forEach(d => {
            const msg    = d.data();
            const isMine = msg.from===myPhone;
            const time   = msg.timestamp?.toDate ? formatTime(msg.timestamp.toDate()) : '';
            if (msg.imageUrl) {
                msgBox.innerHTML += `<div class="msg-bubble ${isMine?'msg-mine':'msg-theirs'}"><img src="${msg.imageUrl}" class="msg-img" onclick="window.openLightbox('${msg.imageUrl}')" onerror="this.style.display='none'"><div class="msg-time">${time}</div></div>`;
            } else {
                msgBox.innerHTML += `<div class="msg-bubble ${isMine?'msg-mine':'msg-theirs'}"><div class="msg-text">${msg.text}</div><div class="msg-time">${time}</div></div>`;
            }
        });
        msgBox.scrollTop = msgBox.scrollHeight;
    });

    const send = async () => {
        const input = document.getElementById('chat-input');
        const text  = input.value.trim();
        if (!text) return;
        input.value='';
        await addDoc(collection(db,`conversations/${chatId}/messages`), {from:myPhone,text,timestamp:serverTimestamp()});
        await setDoc(doc(db,'conversations',chatId), {
            participants:[myPhone,theirPhone], lastMessage:text, lastTimestamp:serverTimestamp(),
            [`unread.${theirPhone}`]:increment(1), [`unread.${myPhone}`]:0
        }, {merge:true});
        await sendNotification(theirPhone,'message','أرسل لك رسالة');
    };

    const chatImgInput = document.getElementById('chat-img-input');
    if (chatImgInput) chatImgInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showLoader();
        const imageUrl = await uploadToCloudinary(file);
        await addDoc(collection(db,`conversations/${chatId}/messages`), {from:myPhone,imageUrl,text:'',timestamp:serverTimestamp()});
        await setDoc(doc(db,'conversations',chatId), {
            participants:[myPhone,theirPhone], lastMessage:'📷 صورة', lastTimestamp:serverTimestamp(),
            [`unread.${theirPhone}`]:increment(1), [`unread.${myPhone}`]:0
        }, {merge:true});
        await sendNotification(theirPhone,'message','أرسل لك صورة');
        hideLoader(); e.target.value='';
    };

    document.getElementById('btn-send-chat').onclick = send;
    document.getElementById('chat-input').addEventListener('keydown', e => { if(e.key==='Enter') send(); });
};

// =====================================================================
//  FRIENDS
// =====================================================================

const loadRequestsBadge = async () => {
    const snap = await getDocs(query(collection(db,'friendRequests'), where('to','==',state.userSession.phone), where('status','==','pending')));
    const badge = document.getElementById('requests-badge');
    if (badge) badge.textContent = snap.size>0 ? snap.size : '';
};

window.loadFriendsTab = async (tab) => {
    document.querySelectorAll('.friend-tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
    const container = document.getElementById('tab-content');
    container.innerHTML='<div style="text-align:center;margin-top:30px"><div class="spinner" style="width:28px;height:28px;margin:0 auto"></div></div>';
    const myPhone = state.userSession.phone;

    if (tab==='all') {
        const [usersSnap,friendsSnap,reqSnap] = await Promise.all([
            getDocs(collection(db,'users')),
            getDocs(query(collection(db,'friendRequests'), where('status','==','accepted'))),
            getDocs(query(collection(db,'friendRequests'), where('from','==',myPhone)))
        ]);
        const friendPhones=new Set();
        friendsSnap.forEach(d=>{ const r=d.data(); if(r.from===myPhone) friendPhones.add(r.to); if(r.to===myPhone) friendPhones.add(r.from); });
        const pendingPhones=new Set();
        reqSnap.forEach(d=>{ if(d.data().status==='pending') pendingPhones.add(d.data().to); });
        let html='<div class="users-list">';
        for (const d of usersSnap.docs) {
            const u=d.data();
            if(u.phone===myPhone||!u.profileComplete) continue;
            const photo=u.photoUrl||'https://via.placeholder.com/50';
            const isFriend=friendPhones.has(u.phone);
            const isPending=pendingPhones.has(u.phone);
            const online=await isOnline(u.phone);
            const actionBtn = isFriend
                ? `<button class="friend-action-btn friend-btn" disabled>✓ صديق</button>`
                : isPending
                    ? `<button class="friend-action-btn pending-btn" disabled>⏳ بانتظار</button>`
                    : `<button class="friend-action-btn add-btn" onclick="window.sendFriendRequest('${u.phone}',this)">+ إضافة</button>`;
            html+=`
                <div class="user-card" onclick="window.openUserProfile('${u.phone}')">
                    <div class="user-card-left">
                        <div class="user-card-avatar-wrap">
                            <img src="${photo}" class="user-card-avatar" alt="">
                            <div class="user-card-online ${online?'show':''}"></div>
                        </div>
                        <div>
                            <div class="user-card-name">${u.name||''} ${u.surname||''}</div>
                            <div class="user-card-bio">${u.bio||''}</div>
                        </div>
                    </div>
                    <div onclick="event.stopPropagation()">${actionBtn}</div>
                </div>`;
        }
        container.innerHTML=html+'</div>';

    } else if (tab==='requests') {
        const snap=await getDocs(query(collection(db,'friendRequests'), where('to','==',myPhone), where('status','==','pending')));
        if(snap.empty){container.innerHTML='<p style="text-align:center;color:gray;margin-top:40px">لا توجد طلبات</p>';return;}
        const cards=await Promise.all(snap.docs.map(async d=>{
            const us=await getDoc(doc(db,'users',d.data().from));
            const u=us.data(); if(!u) return '';
            const photo=u.photoUrl||'https://via.placeholder.com/50';
            return `
                <div class="user-card">
                    <div class="user-card-left" onclick="window.openUserProfile('${u.phone}')">
                        <div class="user-card-avatar-wrap"><img src="${photo}" class="user-card-avatar" alt=""></div>
                        <div><div class="user-card-name">${u.name||''} ${u.surname||''}</div><div class="user-card-bio">${u.bio||''}</div></div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="friend-action-btn accept-btn" onclick="window.acceptRequest('${d.id}','${u.phone}',this)">قبول</button>
                        <button class="friend-action-btn reject-btn" onclick="window.rejectRequest('${d.id}',this)">رفض</button>
                    </div>
                </div>`;
        }));
        container.innerHTML='<div class="users-list">'+cards.join('')+'</div>';

    } else if (tab==='myfriends') {
        const [s1,s2]=await Promise.all([
            getDocs(query(collection(db,'friendRequests'), where('from','==',myPhone), where('status','==','accepted'))),
            getDocs(query(collection(db,'friendRequests'), where('to','==',myPhone),   where('status','==','accepted')))
        ]);
        const phones=[];
        s1.forEach(d=>phones.push({id:d.id,phone:d.data().to}));
        s2.forEach(d=>phones.push({id:d.id,phone:d.data().from}));
        if(!phones.length){container.innerHTML='<p style="text-align:center;color:gray;margin-top:40px">لا يوجد أصدقاء بعد</p>';return;}
        const cards=await Promise.all(phones.map(async({id:reqId,phone})=>{
            const us=await getDoc(doc(db,'users',phone));
            const u=us.data(); if(!u) return '';
            const photo=u.photoUrl||'https://via.placeholder.com/50';
            const online=await isOnline(phone);
            return `
                <div class="user-card" onclick="window.openUserProfile('${u.phone}')">
                    <div class="user-card-left">
                        <div class="user-card-avatar-wrap">
                            <img src="${photo}" class="user-card-avatar" alt="">
                            <div class="user-card-online ${online?'show':''}"></div>
                        </div>
                        <div><div class="user-card-name">${u.name||''} ${u.surname||''}</div><div class="user-card-bio">${u.bio||''}</div></div>
                    </div>
                    <button class="unfriend-btn" onclick="event.stopPropagation();window.unfriend('${reqId}',this)">
                        <i class="fas fa-user-minus"></i> إلغاء
                    </button>
                </div>`;
        }));
        container.innerHTML='<div class="users-list">'+cards.join('')+'</div>';
    }
};

window.sendFriendRequest = async (toPhone, btn) => {
    btn.disabled=true; btn.textContent='⏳ بانتظار'; btn.className='friend-action-btn pending-btn';
    await addDoc(collection(db,'friendRequests'), {from:state.userSession.phone, to:toPhone, status:'pending', timestamp:new Date()});
    await sendNotification(toPhone,'friend','أرسل لك طلب صداقة');
};
window.acceptRequest = async (id, fromPhone, btn) => {
    await updateDoc(doc(db,'friendRequests',id), {status:'accepted'});
    btn.closest('div[style]').innerHTML='<span style="color:var(--success-color);font-size:0.85rem">✓ تمت الموافقة</span>';
    loadRequestsBadge();
    await sendNotification(fromPhone,'friend','قبل طلب صداقتك ✓');
};
window.rejectRequest = async (id, btn) => {
    await deleteDoc(doc(db,'friendRequests',id));
    btn.closest('.user-card').remove();
    loadRequestsBadge();
};
window.unfriend = async (reqId, btn) => {
    if(!confirm('هل تريد إلغاء الصداقة؟')) return;
    await deleteDoc(doc(db,'friendRequests',reqId));
    btn.closest('.user-card').remove();
};
window.openUserProfile = async (phone) => {
    const snap=await getDoc(doc(db,'users',phone));
    if(!snap.exists()) return;
    state.viewedProfile=snap.data();
    renderView('viewProfile');
};

const loadViewedUserPosts = () => {
    const container=document.getElementById('viewed-user-posts');
    if(!container||!state.viewedProfile) return;
    onSnapshot(query(collection(db,'posts'), where('userId','==',state.viewedProfile.phone), orderBy('timestamp','desc')), snap => {
        container.innerHTML=snap.empty?'<p style="text-align:center;color:gray">لا توجد منشورات</p>':'';
        snap.forEach(d => {
            const post=d.data();
            const photo=post.userPhotoUrl||state.viewedProfile.photoUrl||'https://via.placeholder.com/40';
            const dateStr=formatPostDate(post.timestamp);
            container.innerHTML+=`
                <div class="post-card">
                    <div class="post-header">
                        <div class="user-meta">
                            <div class="avatar-wrap"><img src="${photo}" class="avatar" alt="" onerror="this.src='https://via.placeholder.com/40'"></div>
                            <div><div class="user-name">${post.userName}</div><div class="post-date">${dateStr}</div></div>
                        </div>
                    </div>
                    <div class="post-text">${post.text}</div>
                    ${post.imageUrl?`<img src="${post.imageUrl}" class="post-img" onclick="window.openLightbox('${post.imageUrl}')">` : ''}
                </div>`;
        });
    });
};

const renderProfileAction = async () => {
    const container=document.getElementById('profile-action-btn');
    if(!container||!state.viewedProfile) return;
    const myPhone=state.userSession.phone;
    const theirPhone=state.viewedProfile.phone;
    const [s1,s2,followSnap]=await Promise.all([
        getDocs(query(collection(db,'friendRequests'), where('from','==',myPhone),    where('to','==',theirPhone))),
        getDocs(query(collection(db,'friendRequests'), where('from','==',theirPhone), where('to','==',myPhone))),
        getDocs(query(collection(db,'follows'),        where('from','==',myPhone),    where('to','==',theirPhone)))
    ]);
    let friendStatus=null, friendDocId=null;
    if(!s1.empty){friendStatus=s1.docs[0].data().status; friendDocId=s1.docs[0].id;}
    else if(!s2.empty){friendStatus=s2.docs[0].data().status; friendDocId=s2.docs[0].id;}
    const isFollowing=!followSnap.empty;
    const followDocId=isFollowing?followSnap.docs[0].id:null;
    let html='';
    if(friendStatus==='accepted'){
        html+=`<button class="friend-action-btn friend-btn" disabled>✓ صديق</button>
               <button class="unfriend-btn" id="btn-unfriend-profile"><i class="fas fa-user-minus"></i> إلغاء الصداقة</button>`;
    } else if(friendStatus==='pending'){
        html+=`<button class="friend-action-btn pending-btn" disabled>⏳ بانتظار الرد</button>`;
    } else {
        html+=`<button class="friend-action-btn add-btn" id="btn-add-from-profile">+ إضافة صديق</button>`;
    }
    html+=`<button class="friend-action-btn msg-btn" id="btn-msg-profile"><i class="fas fa-comment-dots"></i> مراسلة</button>`;
    html+=isFollowing
        ? `<button class="following-btn" id="btn-follow-profile"><i class="fas fa-check"></i> متابَع</button>`
        : `<button class="follow-btn"    id="btn-follow-profile"><i class="fas fa-plus"></i> متابعة</button>`;
    container.innerHTML=html;
    document.getElementById('btn-msg-profile')?.addEventListener('click',()=>window.openChat(theirPhone));
    document.getElementById('btn-add-from-profile')?.addEventListener('click',async()=>{
        await window.sendFriendRequest(theirPhone, document.getElementById('btn-add-from-profile'));
    });
    document.getElementById('btn-unfriend-profile')?.addEventListener('click',async()=>{
        if(!confirm('إلغاء الصداقة؟')) return;
        await deleteDoc(doc(db,'friendRequests',friendDocId));
        renderProfileAction(); loadViewedProfileStats();
    });
    document.getElementById('btn-follow-profile')?.addEventListener('click',async()=>{
        if(isFollowing){ await deleteDoc(doc(db,'follows',followDocId)); }
        else { await addDoc(collection(db,'follows'),{from:myPhone,to:theirPhone,createdAt:serverTimestamp()}); await sendNotification(theirPhone,'follow','بدأ يتابعك ➕'); }
        renderProfileAction(); loadViewedProfileStats();
    });
};

// =====================================================================
//  MARKET
// =====================================================================

const loadMarketTab = async (tab) => {
    state.activeMarketTab=tab;
    document.querySelectorAll('.market-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
    const container=document.getElementById('market-tab-content');
    container.innerHTML=`<div style="text-align:center;padding:40px;color:#b2bec3"><div class="spinner" style="width:28px;height:28px;margin:0 auto 10px"></div></div>`;
    if(tab==='shops')  await loadShopsTab(container);
    if(tab==='random') await loadListingsTab(container,'random');
    if(tab==='cars')   await loadListingsTab(container,'cars');
};

const loadShopsTab = async (container) => {
    const myPhone=state.userSession.phone;
    const shopsSnap=await getDocs(collection(db,'shops'));
    let myShop=null;
    shopsSnap.forEach(d=>{if(d.data().ownerId===myPhone) myShop={id:d.id,...d.data()};});
    let html='';
    if(!myShop){
        html+=`
        <div class="open-shop-banner">
            <div class="open-shop-icon">🏪</div>
            <div class="open-shop-text">افتح محلك الخاص في المريج!</div>
            <button class="market-action-btn add-product-btn" id="btn-open-shop-modal"><i class="fas fa-plus"></i> فتح محل</button>
        </div>
        <div id="open-shop-form" class="add-listing-form" style="display:none">
            <h4 style="color:var(--primary-color)">بيانات المحل الجديد</h4>
            <input type="text" id="shop-name-input" placeholder="اسم المحل *" class="market-input">
            <textarea id="shop-desc-input" placeholder="وصف المحل (اختياري)" class="market-input market-textarea"></textarea>
            <label class="market-img-label"><i class="fas fa-camera"></i> شعار المحل<input type="file" id="shop-logo-file" style="display:none" accept="image/*"></label>
            <div id="shop-logo-preview"></div>
            <button class="btn-post" id="btn-create-shop">إنشاء المحل</button>
        </div>`;
    } else {
        html+=`<div class="my-shop-bar" onclick="window.openShop('${myShop.id}')">
            <img src="${myShop.logoUrl||'https://via.placeholder.com/44'}" class="my-shop-logo" onerror="this.src='https://via.placeholder.com/44'">
            <div><div class="my-shop-label">محلك: <strong>${myShop.name}</strong></div><div style="font-size:0.74rem;color:#636e72">اضغط لإدارة محلك</div></div>
            <i class="fas fa-chevron-left" style="color:#b2bec3;margin-right:auto"></i>
        </div>`;
    }
    html+=`<div class="section-label">جميع المحلات</div><div class="shops-grid">`;
    if(shopsSnap.empty){ html+=`<p style="text-align:center;color:gray;padding:30px">لا توجد محلات بعد</p>`; }
    else { shopsSnap.forEach(d=>{ const s=d.data(); const logo=s.logoUrl||'https://via.placeholder.com/56';
        html+=`<div class="shop-card" onclick="window.openShop('${d.id}')">
            <img src="${logo}" class="shop-card-logo" onerror="this.src='https://via.placeholder.com/56'">
            <div class="shop-card-info"><div class="shop-card-name">${s.name}</div><div class="shop-card-owner">🧑 ${s.ownerName||''}</div><div class="shop-card-desc">${(s.description||'').substring(0,50)}</div></div>
            <i class="fas fa-chevron-left" style="color:#b2bec3;flex-shrink:0"></i>
        </div>`; }); }
    html+='</div>';
    container.innerHTML=html;
    document.getElementById('btn-open-shop-modal')?.addEventListener('click',()=>{ const f=document.getElementById('open-shop-form'); f.style.display=f.style.display==='none'?'block':'none'; });
    document.getElementById('shop-logo-file')?.addEventListener('change',(e)=>{ const r=new FileReader(); r.onload=()=>{ document.getElementById('shop-logo-preview').innerHTML=`<img src="${r.result}" style="width:70px;height:70px;border-radius:50%;object-fit:cover;border:3px solid white;margin-top:6px">`; }; r.readAsDataURL(e.target.files[0]); });
    document.getElementById('btn-create-shop')?.addEventListener('click',async()=>{
        const name=document.getElementById('shop-name-input').value.trim();
        if(!name) return alert('أدخل اسم المحل');
        const desc=document.getElementById('shop-desc-input').value.trim();
        const logoF=document.getElementById('shop-logo-file').files[0];
        showLoader(); let logoUrl='';
        if(logoF) logoUrl=await uploadToCloudinary(logoF);
        await addDoc(collection(db,'shops'),{name,description:desc,logoUrl,coverUrl:'',ownerId:myPhone,ownerName:`${state.userSession.name||''} ${state.userSession.surname||''}`.trim(),createdAt:serverTimestamp()});
        hideLoader(); loadMarketTab('shops');
    });
};

window.openShop = async (shopId) => {
    const snap=await getDoc(doc(db,'shops',shopId));
    if(!snap.exists()) return;
    state.activeShop={id:shopId,...snap.data()};
    renderView('shopPage');
};

const loadShopProducts = () => {
    const grid=document.getElementById('shop-products-grid');
    if(!grid||!state.activeShop) return;
    const shopId=state.activeShop.id;
    const isOwner=state.activeShop.ownerId===state.userSession.phone;
    onSnapshot(query(collection(db,`shops/${shopId}/products`),orderBy('createdAt','desc')),snap=>{
        if(snap.empty){grid.innerHTML=`<p style="text-align:center;color:gray;padding:30px;grid-column:1/-1">${isOwner?'📦 أضف أول منتج!':'لا يوجد منتجات بعد'}</p>`;return;}
        grid.innerHTML='';
        snap.forEach(d=>{ const p=d.data();
            grid.innerHTML+=`<div class="product-card">
                ${p.imageUrl?`<img src="${p.imageUrl}" class="product-img" onclick="window.openLightbox('${p.imageUrl}')">`:`<div class="product-img-placeholder">📦</div>`}
                <div class="product-info"><div class="product-name">${p.name}</div><div class="product-desc">${(p.description||'').substring(0,55)}</div>${p.price?`<div class="product-price">${p.price} دج</div>`:''}</div>
                ${isOwner?`<button class="product-delete-btn" onclick="window.deleteProduct('${shopId}','${d.id}')"><i class="fas fa-trash"></i></button>`:''}
            </div>`;
        });
    });
};
window.deleteProduct = async (shopId,pid) => { if(confirm('حذف المنتج؟')) await deleteDoc(doc(db,`shops/${shopId}/products`,pid)); };

const loadListingsTab = async (container, type) => {
    const myPhone=state.userSession.phone; const isCars=type==='cars';
    container.innerHTML=`
        <div class="listing-add-bar"><button class="market-action-btn add-product-btn" id="btn-toggle-listing">${isCars?'🚗 أضف سيارة':'🏷️ أضف إعلان'}</button></div>
        <div id="add-listing-form" class="add-listing-form" style="display:none">
            <h4 style="color:var(--primary-color)">${isCars?'بيانات السيارة':'بيانات الإعلان'}</h4>
            <input type="text" id="lst-title" placeholder="${isCars?'الموديل':'العنوان'} *" class="market-input">
            <textarea id="lst-desc" placeholder="${isCars?'الحالة، الكيلومتراج...':'الوصف...'}" class="market-input market-textarea"></textarea>
            <input type="number" id="lst-price" placeholder="السعر (دج)" class="market-input">
            <label class="market-img-label"><i class="fas fa-camera"></i> صورة<input type="file" id="lst-img" style="display:none" accept="image/*"></label>
            <div id="lst-img-preview"></div>
            <button class="btn-post" id="btn-submit-listing">نشر الإعلان</button>
        </div>
        <div id="listings-grid" class="listings-grid"><div style="text-align:center;padding:30px;color:#b2bec3;grid-column:1/-1"><div class="spinner" style="width:22px;height:22px;margin:0 auto 8px"></div></div></div>`;
    document.getElementById('btn-toggle-listing').onclick=()=>{ const f=document.getElementById('add-listing-form'); f.style.display=f.style.display==='none'?'block':'none'; };
    document.getElementById('lst-img').onchange=(e)=>{ const r=new FileReader(); r.onload=()=>{ document.getElementById('lst-img-preview').innerHTML=`<img src="${r.result}" style="width:100%;border-radius:12px;max-height:160px;object-fit:cover;margin-top:6px">`; }; r.readAsDataURL(e.target.files[0]); };
    document.getElementById('btn-submit-listing').onclick=async()=>{
        const title=document.getElementById('lst-title').value.trim(); if(!title) return alert('أدخل العنوان');
        const desc=document.getElementById('lst-desc').value.trim(); const price=document.getElementById('lst-price').value.trim();
        const imgFile=document.getElementById('lst-img').files[0];
        showLoader(); let imageUrl=''; if(imgFile) imageUrl=await uploadToCloudinary(imgFile);
        await addDoc(collection(db,'listings'),{type,title,description:desc,price,imageUrl,sellerId:myPhone,sellerName:`${state.userSession.name||''} ${state.userSession.surname||''}`.trim(),sellerPhoto:state.userSession.photoUrl||'',createdAt:serverTimestamp()});
        hideLoader(); document.getElementById('add-listing-form').style.display='none';
        ['lst-title','lst-desc','lst-price'].forEach(id=>document.getElementById(id).value='');
        document.getElementById('lst-img-preview').innerHTML='';
    };
    const grid=document.getElementById('listings-grid');
    onSnapshot(query(collection(db,'listings'),where('type','==',type)),snap=>{
        const sorted=snap.docs.sort((a,b)=>{ const ta=a.data().createdAt?.toDate?.()||new Date(0); const tb=b.data().createdAt?.toDate?.()||new Date(0); return tb-ta; });
        if(!sorted.length){grid.innerHTML=`<p style="text-align:center;color:gray;padding:30px">لا توجد إعلانات بعد</p>`;return;}
        grid.innerHTML='';
        sorted.forEach(d=>{ const item=d.data(); const img=item.imageUrl||''; const sellerPhoto=item.sellerPhoto||'https://via.placeholder.com/28'; const isOwner=item.sellerId===myPhone;
            grid.innerHTML+=`<div class="listing-card">
                ${img?`<img src="${img}" class="listing-img" onclick="window.openLightbox('${img}')">`:`<div class="listing-img-placeholder">${isCars?'🚗':'📦'}</div>`}
                <div class="listing-body">
                    <div class="listing-title-text">${item.title}</div>
                    <div class="listing-desc-text">${(item.description||'').substring(0,70)}</div>
                    ${item.price?`<div class="listing-price-tag">${item.price} دج</div>`:''}
                    <div class="listing-seller-row" onclick="window.openUserProfile('${item.sellerId}')"><img src="${sellerPhoto}" class="listing-seller-avatar"><span class="listing-seller-name">${item.sellerName}</span></div>
                    <div class="listing-actions-row">
                        <button class="listing-contact-btn" onclick="window.openChat('${item.sellerId}')"><i class="fas fa-comment-dots"></i> تواصل</button>
                        ${isOwner?`<button class="listing-delete-btn" onclick="window.deleteListing('${d.id}')"><i class="fas fa-trash"></i></button>`:''}
                    </div>
                </div>
            </div>`;
        });
    });
};
window.deleteListing=async(id)=>{ if(confirm('حذف الإعلان؟')) await deleteDoc(doc(db,'listings',id)); };

// =====================================================================
//  FEED
// =====================================================================

const emojiMap = { heart:'❤️', like:'👍', laugh:'😂', wow:'😮', sad:'😢', angry:'😡' };

const loadFeed = () => {
    const feedContainer=document.getElementById('feed-container');
    onSnapshot(query(collection(db,'posts'),orderBy('timestamp','desc')), async snap => {
        feedContainer.innerHTML='';
        const postsData=await Promise.all(snap.docs.map(async d=>{
            const post=d.data();
            const authorPhoto=post.userPhotoUrl||await getUserPhoto(post.userId);
            return {post,id:d.id,authorPhoto};
        }));
        postsData.forEach(({post,id:postId,authorPhoto})=>{
            const myPhone=state.userSession.phone;
            const userReaction=post.user_reactions?.[myPhone];
            const totalLikes=Object.values(post.reactions||{}).reduce((a,b)=>a+b,0);
            const dateStr=formatPostDate(post.timestamp);
            const reactorCount=Object.values(post.user_reactions||{}).filter(Boolean).length;
            feedContainer.innerHTML+=`
                <div class="post-card">
                    <div class="post-header">
                        <div class="user-meta" onclick="window.openUserProfile('${post.userId}')">
                            <div class="avatar-wrap">
                                <img src="${authorPhoto}" class="avatar" alt="" onerror="this.src='https://via.placeholder.com/40'">
                                <div class="online-dot" id="dot-${postId}"></div>
                            </div>
                            <div>
                                <div class="user-name">${post.userName}</div>
                                <div class="post-date">${dateStr}</div>
                            </div>
                        </div>
                        ${post.userId===myPhone?`<i class="fas fa-trash" style="color:var(--error-color);cursor:pointer;margin-top:2px" onclick="window.deletePost('${postId}')"></i>`:''}
                    </div>
                    <div class="post-text">${post.text}</div>
                    ${post.imageUrl?`<img src="${post.imageUrl}" class="post-img" onclick="window.openLightbox('${post.imageUrl}')">` : ''}
                    <div class="interaction-bar">
                        <div style="display:flex;align-items:center;gap:6px">
                            <button class="like-btn ${userReaction?'active':''}" onclick="window.toggleReactionMenu(event,'${postId}','${post.userId}')">
                                <span>${userReaction?emojiMap[userReaction]:'👍'}</span> ${totalLikes}
                            </button>
                            ${reactorCount>0?`<button class="reactors-btn" onclick="window.showReactors('${postId}')"><i class="fas fa-users"></i> ${reactorCount}</button>`:''}
                        </div>
                        <div style="display:flex;gap:10px">
                            <button class="action-btn" onclick="window.toggleComments('${postId}','${post.userId}')"><i class="far fa-comment"></i> تعليق</button>
                            <button class="action-btn" onclick="window.sharePost('${postId}','${post.userId}')"><i class="fas fa-share"></i></button>
                        </div>
                    </div>
                    <div id="comments-${postId}" class="comments-section" style="display:none">
                        <div id="comments-list-${postId}"></div>
                        <div class="comment-input-wrapper">
                            <input type="text" class="comment-input" id="comment-input-${postId}" placeholder="اكتب تعليقاً...">
                            <button class="btn-post" style="padding:5px 10px;font-size:0.8rem" onclick="window.addComment('${postId}','${post.userId}')">نشر</button>
                        </div>
                    </div>
                </div>`;

            // نقطة اتصال realtime لكل منشور
            const dotEl=document.getElementById(`dot-${postId}`);
            if(dotEl && post.userId !== state.userSession.phone) {
                const unsub=watchOnlineDot(post.userId, dotEl);
                _onlineDotUnsubs.push(unsub);
            } else if(dotEl && post.userId===state.userSession.phone) {
                dotEl.classList.add('show'); // أنت دائماً متصل
            }

            const commentsList=document.getElementById(`comments-list-${postId}`);
            if(commentsList){
                onSnapshot(query(collection(db,`posts/${postId}/comments`),orderBy('timestamp','asc')),cs=>{
                    commentsList.innerHTML='';
                    cs.forEach(c=>{ const cd=c.data(); commentsList.innerHTML+=`<div class="comment-item"><strong>${cd.userName}:</strong> ${cd.text}</div>`; });
                });
            }
        });
    });
};

const loadUserFeed = () => {
    const container=document.getElementById('user-posts-feed');
    onSnapshot(query(collection(db,'posts'),where('userId','==',state.userSession.phone),orderBy('timestamp','desc')),snap=>{
        container.innerHTML='';
        if(snap.empty){container.innerHTML='<p style="text-align:center;color:gray">لا توجد منشورات بعد</p>';return;}
        snap.forEach(d=>{
            const post=d.data(); const dateStr=formatPostDate(post.timestamp);
            container.innerHTML+=`
                <div class="user-post-mini">
                    ${post.imageUrl?`<img src="${post.imageUrl}" class="user-post-mini-thumb" onclick="window.openLightbox('${post.imageUrl}')">` : ''}
                    <div style="flex:1">
                        <div class="user-post-mini-text">${post.text.substring(0,60)}${post.text.length>60?'...':''}</div>
                        <div style="font-size:0.7rem;color:#b2bec3;margin-top:3px">${dateStr}</div>
                    </div>
                    <button class="user-post-mini-del" onclick="window.deletePost('${d.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                </div>`;
        });
    });
};

// =====================================================================
//  REACTIONS & COMMENTS
// =====================================================================

const picker=document.getElementById('reaction-picker');

window.toggleReactionMenu=async(event,postId,postOwnerId)=>{
    const btn=event.currentTarget; const myPhone=state.userSession.phone;
    const postRef=doc(db,'posts',postId); const snap=await getDoc(postRef);
    const prev=snap.data().user_reactions?.[myPhone];
    if(prev){ await updateDoc(postRef,{[`user_reactions.${myPhone}`]:null,[`reactions.${prev}`]:increment(-1)}); return; }
    state.activePostId=postId; state.activePostOwnerId=postOwnerId;
    const rect=btn.getBoundingClientRect(); let leftPos=rect.left;
    if(leftPos+260>window.innerWidth) leftPos=window.innerWidth-270;
    picker.style.display='flex'; picker.style.top=`${rect.top-62}px`; picker.style.left=`${leftPos}px`;
};

window.selectReaction=async(type)=>{
    const postRef=doc(db,'posts',state.activePostId); const snap=await getDoc(postRef);
    const prev=snap.data().user_reactions?.[state.userSession.phone];
    if(prev) await updateDoc(postRef,{[`reactions.${prev}`]:increment(-1)});
    await updateDoc(postRef,{[`user_reactions.${state.userSession.phone}`]:type,[`reactions.${type}`]:increment(1)});
    picker.style.display='none';
    const label={heart:'أعجب بمنشورك ❤️',like:'أعجب بمنشورك 👍',laugh:'ضحك على منشورك 😂',wow:'أُعجب بمنشورك 😮',sad:'أحزنه منشورك 😢',angry:'غضب من منشورك 😡'};
    await sendNotification(state.activePostOwnerId,'like',label[type]||'تفاعل مع منشورك');
};

window.toggleComments=(postId)=>{ const s=document.getElementById(`comments-${postId}`); s.style.display=s.style.display==='block'?'none':'block'; };

window.addComment=async(postId,postOwnerId)=>{
    const input=document.getElementById(`comment-input-${postId}`); const text=input.value.trim(); if(!text) return;
    await addDoc(collection(db,`posts/${postId}/comments`),{userName:state.userSession.name,text,timestamp:new Date()});
    input.value='';
    await sendNotification(postOwnerId,'comment','علّق على منشورك 💬');
};

window.deletePost=async(id)=>{ if(confirm('حذف المنشور؟')) await deleteDoc(doc(db,'posts',id)); };

window.sharePost=async(postId,postOwnerId)=>{
    if(navigator.share) navigator.share({title:'منشور المريج',url:window.location.href});
    await sendNotification(postOwnerId,'share','شارك منشورك 🔁');
};

window.openLightbox=(url)=>{ document.getElementById('lightbox-img').src=url; document.getElementById('lightbox').style.display='flex'; };

// =====================================================================
//  EVENT LISTENERS
// =====================================================================

const attachEventListeners=(view)=>{

    if(view==='login'){
        document.getElementById('btn-login').onclick=async()=>{
            const phone=document.getElementById('login-phone').value.trim();
            const pass=document.getElementById('login-pass').value;
            if(!phone||!pass) return alert('أدخل جميع الحقول');
            showLoader();
            const snap=await getDocs(query(collection(db,'users'),where('phone','==',phone)));
            if(snap.empty){alert('رقم الهاتف غير موجود');hideLoader();return;}
            const user=snap.docs[0].data();
            if(user.password!==pass){alert('كلمة السر خاطئة');hideLoader();return;}
            state.userSession=user; localStorage.setItem('userSession',JSON.stringify(user));
            hideLoader(); startBadgeListeners();
            renderView(user.profileComplete?'home':'setupProfile');
        };
        document.getElementById('switch-to-signup').onclick=()=>renderView('signup');
    }

    if(view==='signup'){
        document.getElementById('btn-signup').onclick=async()=>{
            const phone=document.getElementById('signup-phone').value.trim();
            const pass=document.getElementById('signup-pass').value;
            if(!phone||!pass) return alert('أدخل جميع الحقول');
            showLoader();
            const newUser={phone,password:pass,profileComplete:false};
            await setDoc(doc(db,'users',phone),newUser);
            state.userSession=newUser; localStorage.setItem('userSession',JSON.stringify(newUser));
            hideLoader(); renderView('setupProfile');
        };
        document.getElementById('switch-to-login').onclick=()=>renderView('login');
    }

    if(view==='setupProfile'){
        document.getElementById('btn-save-profile').onclick=async()=>{
            const name=document.getElementById('p-name').value.trim(); if(!name) return alert('أدخل اسمك');
            const updateData={name,surname:document.getElementById('p-surname').value.trim(),bio:document.getElementById('p-bio').value.trim(),location:document.getElementById('p-location').value.trim(),dob:document.getElementById('p-dob').value,profileComplete:true};
            showLoader(); await updateDoc(doc(db,'users',state.userSession.phone),updateData);
            state.userSession={...state.userSession,...updateData}; localStorage.setItem('userSession',JSON.stringify(state.userSession));
            hideLoader(); startBadgeListeners(); renderView('home');
        };
    }

    if(view==='profile'){
        document.getElementById('btn-edit-profile').onclick=()=>renderView('editProfile');
        document.getElementById('btn-logout').onclick=()=>{
            stopBadgeListeners(); setOnlineStatus(false);
            localStorage.removeItem('userSession'); state.userSession=null; renderView('login');
        };
        document.getElementById('avatar-upload').onchange=async(e)=>{
            const file=e.target.files[0]; if(!file) return;
            showLoader(); const url=await uploadToCloudinary(file);
            await updateDoc(doc(db,'users',state.userSession.phone),{photoUrl:url});
            state.userSession.photoUrl=url; _photoCache[state.userSession.phone]=url;
            localStorage.setItem('userSession',JSON.stringify(state.userSession));
            hideLoader(); renderView('profile');
        };
    }

    if(view==='editProfile'){
        document.getElementById('btn-update-profile').onclick=async()=>{
            const updateData={name:document.getElementById('e-name').value.trim(),surname:document.getElementById('e-surname').value.trim(),bio:document.getElementById('e-bio').value.trim(),location:document.getElementById('e-location').value.trim()};
            showLoader(); await updateDoc(doc(db,'users',state.userSession.phone),updateData);
            state.userSession={...state.userSession,...updateData}; localStorage.setItem('userSession',JSON.stringify(state.userSession));
            hideLoader(); renderView('profile');
        };
        document.getElementById('btn-cancel-edit').onclick=()=>renderView('profile');
    }

    if(view==='home'){
        document.getElementById('composer-trigger').onclick=()=>{ const box=document.getElementById('composer-box'); box.style.display=box.style.display==='block'?'none':'block'; };
        document.getElementById('post-image-file').onchange=(e)=>{ const file=e.target.files[0]; if(!file) return; const r=new FileReader(); r.onload=()=>{ document.getElementById('composer-img-preview').innerHTML=`<img src="${r.result}" style="width:100%;border-radius:15px;max-height:200px;object-fit:cover">`; }; r.readAsDataURL(file); };
        document.getElementById('btn-submit-post').onclick=async()=>{
            const text=document.getElementById('post-text').value.trim();
            const file=document.getElementById('post-image-file').files[0];
            if(!text&&!file) return;
            showLoader(); const url=file?await uploadToCloudinary(file):null;
            await addDoc(collection(db,'posts'),{text:text||'',imageUrl:url,userId:state.userSession.phone,userName:state.userSession.name||'',userPhotoUrl:state.userSession.photoUrl||'',timestamp:new Date(),reactions:{like:0,heart:0,laugh:0,wow:0,sad:0,angry:0},user_reactions:{}});
            document.getElementById('post-text').value=''; document.getElementById('composer-img-preview').innerHTML='';
            document.getElementById('composer-box').style.display='none'; hideLoader();
        };
    }

    if(view==='friends') document.querySelectorAll('.friend-tab').forEach(t=>t.onclick=()=>window.loadFriendsTab(t.dataset.tab));
    if(view==='viewProfile') document.getElementById('btn-back-friends')?.addEventListener('click',()=>renderView('friends'));
    if(view==='chatRoom') document.getElementById('btn-back-chat').onclick=()=>{ setActiveNav('chat'); renderView('chat'); };
    if(view==='notifications'){
        document.getElementById('btn-mark-all-read')?.addEventListener('click',async()=>{
            const snap=await getDocs(query(collection(db,'notifications'),where('to','==',state.userSession.phone),where('read','==',false)));
            await Promise.all(snap.docs.map(d=>updateDoc(doc(db,'notifications',d.id),{read:true})));
        });
    }
    if(view==='market') document.querySelectorAll('.market-tab').forEach(t=>t.onclick=()=>loadMarketTab(t.dataset.tab));
    if(view==='shopPage'){
        document.getElementById('btn-back-market').onclick=()=>{ setActiveNav('market'); renderView('market'); };
        document.getElementById('btn-add-product')?.addEventListener('click',()=>{ const f=document.getElementById('add-product-form'); f.style.display=f.style.display==='none'?'block':'none'; });
        document.getElementById('prod-img-file')?.addEventListener('change',(e)=>{ const r=new FileReader(); r.onload=()=>{ document.getElementById('prod-img-preview').innerHTML=`<img src="${r.result}" style="width:100%;border-radius:12px;max-height:150px;object-fit:cover;margin-top:6px">`; }; r.readAsDataURL(e.target.files[0]); });
        document.getElementById('btn-submit-product')?.addEventListener('click',async()=>{
            const name=document.getElementById('prod-name').value.trim(); if(!name) return alert('أدخل اسم المنتج');
            const desc=document.getElementById('prod-desc').value.trim(); const price=document.getElementById('prod-price').value.trim();
            const imgFile=document.getElementById('prod-img-file').files[0];
            showLoader(); let imageUrl=''; if(imgFile) imageUrl=await uploadToCloudinary(imgFile);
            await addDoc(collection(db,`shops/${state.activeShop.id}/products`),{name,description:desc,price,imageUrl,createdAt:serverTimestamp()});
            document.getElementById('prod-name').value=''; document.getElementById('prod-desc').value=''; document.getElementById('prod-price').value='';
            document.getElementById('prod-img-preview').innerHTML=''; document.getElementById('add-product-form').style.display='none'; hideLoader();
        });
        document.getElementById('shop-cover-upload')?.addEventListener('change',async(e)=>{
            const file=e.target.files[0]; if(!file) return;
            showLoader(); const url=await uploadToCloudinary(file);
            await updateDoc(doc(db,'shops',state.activeShop.id),{coverUrl:url});
            state.activeShop.coverUrl=url; hideLoader(); renderView('shopPage');
        });
    }
};

// =====================================================================
//  NAV
// =====================================================================

document.getElementById('nav-notifications').onclick=()=>{ setActiveNav(null); renderView('notifications'); };
document.getElementById('nav-profile').onclick=()=>{ setActiveNav(null); renderView('profile'); };

function setActiveNav(viewName){
    document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.getAttribute('data-view')===viewName));
}

document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',function(){ setActiveNav(this.getAttribute('data-view')); renderView(this.getAttribute('data-view')); });
});

document.querySelectorAll('.emoji').forEach(e=>e.onclick=()=>window.selectReaction(e.dataset.type));
document.addEventListener('click',e=>{ if(!picker.contains(e.target)&&!e.target.closest('.like-btn')) picker.style.display='none'; });

window.addEventListener('beforeunload',()=>setOnlineStatus(false));
window.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') setOnlineStatus(true); else setOnlineStatus(false); });

// =====================================================================
//  INIT
// =====================================================================

window.onload=()=>{
    hideLoader();
    if(state.userSession){ startBadgeListeners(); renderView(state.userSession.profileComplete?'home':'setupProfile'); }
    else renderView('login');
};

